//! Hermes Bridge - High-performance WebSocket-to-stdio bridge for Hermes Agent
//!
//! Spawns the tui_gateway subprocess and pipes JSON-RPC between
//! a browser WebSocket and the gateway's stdin/stdout.
//!
//! ~2MB RAM, instant startup, zero-copy message forwarding.

use futures_util::{SinkExt, StreamExt};
use log::{error, info, warn};
use serde_json::Value;
use std::env;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 9120;

fn resolve_agent_dir() -> PathBuf {
    if let Ok(dir) = env::var("HERMES_AGENT_DIR") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    // Default: sibling directory
    let exe = env::current_exe().unwrap_or_default();
    let project_root = exe
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .unwrap_or(Path::new("."));
    project_root.parent().unwrap_or(Path::new(".")).join("hermes-agent")
}

fn resolve_python(agent_dir: &Path) -> String {
    if let Ok(py) = env::var("HERMES_PYTHON") {
        if !py.is_empty() {
            return py;
        }
    }
    let candidates = [
        agent_dir.join(".venv/bin/python"),
        agent_dir.join(".venv/bin/python3"),
        agent_dir.join("venv/bin/python"),
        agent_dir.join("venv/bin/python3"),
    ];
    for c in &candidates {
        if c.is_file() {
            return c.to_string_lossy().into_owned();
        }
    }
    "python3".into()
}

fn spawn_gateway(agent_dir: &Path) -> std::io::Result<Child> {
    let python = resolve_python(agent_dir);
    let cwd = env::var("HERMES_CWD").unwrap_or_else(|_| agent_dir.to_string_lossy().into_owned());

    let mut env_map: std::collections::HashMap<String, String> = env::vars().collect();
    let agent_root = agent_dir.to_string_lossy().into_owned();
    let py_path = env_map.get("PYTHONPATH").cloned().unwrap_or_default();
    env_map.insert(
        "PYTHONPATH".into(),
        if py_path.is_empty() {
            agent_root.clone()
        } else {
            format!("{agent_root}:{py_path}")
        },
    );

    info!("Spawning gateway: {python} -m tui_gateway.entry (cwd={cwd})");

    Command::new(&python)
        .arg("-m")
        .arg("tui_gateway.entry")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(&cwd)
        .envs(&env_map)
        .kill_on_drop(true)
        .spawn()
}

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_secs()
        .init();

    let agent_dir = resolve_agent_dir();
    if !agent_dir.exists() {
        error!(
            "hermes-agent directory not found at {}\nSet HERMES_AGENT_DIR env var.",
            agent_dir.display()
        );
        std::process::exit(1);
    }

    let host = env::var("BRIDGE_HOST").unwrap_or_else(|_| DEFAULT_HOST.into());
    let port: u16 = env::var("BRIDGE_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    let addr = format!("{host}:{port}");
    let listener = TcpListener::bind(&addr).await.expect("Failed to bind");
    info!("hermes-agent dir: {}", agent_dir.display());
    info!("Python: {}", resolve_python(&agent_dir));
    info!("Bridge ready on ws://{addr}");

    while let Ok((stream, remote)) = listener.accept().await {
        let agent_dir = agent_dir.clone();
        tokio::spawn(async move {
            info!("Client connected: {remote}");
            if let Err(e) = handle_connection(stream, &agent_dir).await {
                error!("Connection error ({remote}): {e}");
            }
            info!("Client disconnected: {remote}");
        });
    }
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    agent_dir: &Path,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ws_stream = accept_async(stream).await?;
    let (ws_tx, mut ws_rx) = ws_stream.split();
    let ws_tx = Arc::new(Mutex::new(ws_tx));

    let mut child = spawn_gateway(agent_dir)?;

    let mut stdin = child.stdin.take().expect("no stdin");
    let stdout = child.stdout.take().expect("no stdout");
    let stderr = child.stderr.take().expect("no stderr");

    let ready = Arc::new(tokio::sync::Notify::new());

    // stdout → WebSocket (zero-copy line forwarding)
    let ws_tx_stdout = Arc::clone(&ws_tx);
    let ready_clone = Arc::clone(&ready);
    let stdout_task = tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.is_empty() {
                continue;
            }
            // Check for gateway.ready
            if let Ok(msg) = serde_json::from_str::<Value>(&line) {
                if msg.get("method").and_then(|m| m.as_str()) == Some("event") {
                    if let Some(params) = msg.get("params") {
                        if params.get("type").and_then(|t| t.as_str()) == Some("gateway.ready") {
                            info!("Gateway ready");
                            ready_clone.notify_one();
                        }
                    }
                }
            }
            let mut tx = ws_tx_stdout.lock().await;
            if tx.send(Message::Text(line.into())).await.is_err() {
                break;
            }
        }
    });

    // stderr → log only (do not forward to frontend to avoid UI clutter)
    let stderr_task = tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.is_empty() {
                continue;
            }
            info!("[gateway stderr] {line}");
            // Only log locally, don't send to frontend
        }
    });

    // Wait for gateway.ready (30s timeout)
    tokio::select! {
        _ = ready.notified() => {}
        _ = tokio::time::sleep(std::time::Duration::from_secs(30)) => {
            warn!("Gateway did not send gateway.ready within 30s");
        }
    }

    // WebSocket → stdin (forward JSON-RPC messages)
    while let Some(msg) = ws_rx.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(_) => break,
        };
        match msg {
            Message::Text(text) => {
                // Validate JSON
                if serde_json::from_str::<Value>(text.as_ref()).is_err() {
                    let err = serde_json::json!({
                        "jsonrpc": "2.0",
                        "error": {"code": -32700, "message": "Parse error"},
                        "id": null
                    });
                    let mut tx = ws_tx.lock().await;
                    let _ = tx.send(Message::Text(err.to_string().into())).await;
                    continue;
                }
                if stdin
                    .write_all(format!("{text}\n").as_bytes())
                    .await
                    .is_err()
                {
                    break;
                }
                let _ = stdin.flush().await;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Cleanup
    drop(stdin);
    let _ = child.kill().await;
    stdout_task.abort();
    stderr_task.abort();
    Ok(())
}
