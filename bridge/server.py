"""
Hermes-Web - WebSocket Bridge

Spawns the hermes-agent tui_gateway subprocess and bridges JSON-RPC
messages between a browser WebSocket and the gateway's stdin/stdout.

Usage:
    # Set HERMES_AGENT_DIR to point at your hermes-agent clone
    HERMES_AGENT_DIR=/path/to/hermes-agent python bridge/server.py

    # Or rely on the default sibling directory
    python bridge/server.py
"""

import asyncio
import json
import logging
import os
import signal
import sys
from pathlib import Path
from typing import Optional

import websockets
from websockets.asyncio.server import serve

logging.basicConfig(
    level=logging.INFO,
    format="[bridge] %(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("bridge")

# ── Configuration ────────────────────────────────────────────────────

HERMES_AGENT_DIR = Path(
    os.environ.get("HERMES_AGENT_DIR", "")
    or Path(__file__).resolve().parent.parent.parent / "hermes-agent"
).resolve()

BRIDGE_HOST = os.environ.get("BRIDGE_HOST", "0.0.0.0")
BRIDGE_PORT = int(os.environ.get("BRIDGE_PORT", "9120"))

# Python executable to run the gateway with
HERMES_PYTHON = os.environ.get("HERMES_PYTHON", "")

# hermes-agent config directory
HERMES_CONFIG_DIR = Path.home() / ".hermes"
HERMES_ENV_FILE = HERMES_CONFIG_DIR / ".env"


def resolve_python() -> str:
    """Find the right Python for hermes-agent (mirrors ui-tui logic)."""
    if HERMES_PYTHON:
        return HERMES_PYTHON

    venv = os.environ.get("VIRTUAL_ENV", "").strip()
    candidates = [
        venv and os.path.join(venv, "bin", "python"),
        str(HERMES_AGENT_DIR / ".venv" / "bin" / "python"),
        str(HERMES_AGENT_DIR / ".venv" / "bin" / "python3"),
        str(HERMES_AGENT_DIR / "venv" / "bin" / "python"),
        str(HERMES_AGENT_DIR / "venv" / "bin" / "python3"),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    return "python3"


# ── Gateway Process Manager ──────────────────────────────────────────


class GatewayProcess:
    """Manages a single tui_gateway subprocess."""

    def __init__(self):
        self.proc: Optional[asyncio.subprocess.Process] = None
        self._reader_task: Optional[asyncio.Task] = None
        self._stderr_task: Optional[asyncio.Task] = None
        self._ws: Optional[websockets.WebSocketServerProtocol] = None
        self._ready = asyncio.Event()

    async def start(self, ws: websockets.WebSocketServerProtocol):
        """Spawn the gateway and wire it to the given WebSocket."""
        self._ws = ws
        self._ready.clear()

        python = resolve_python()
        cwd = os.environ.get("HERMES_CWD", str(HERMES_AGENT_DIR))

        env = {**os.environ}
        py_path = env.get("PYTHONPATH", "").strip()
        agent_root = str(HERMES_AGENT_DIR)
        sep = ";" if sys.platform == "win32" else ":"
        env["PYTHONPATH"] = (
            f"{agent_root}{sep}{py_path}" if py_path else agent_root
        )

        log.info("Spawning gateway: %s -m tui_gateway.entry (cwd=%s)", python, cwd)

        self.proc = await asyncio.create_subprocess_exec(
            python, "-m", "tui_gateway.entry",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
            env=env,
        )

        self._reader_task = asyncio.create_task(self._read_stdout())
        self._stderr_task = asyncio.create_task(self._read_stderr())

        # Wait for gateway.ready (with timeout)
        try:
            await asyncio.wait_for(self._ready.wait(), timeout=30.0)
            log.info("Gateway ready")
        except asyncio.TimeoutError:
            log.warning("Gateway did not send gateway.ready within 30s")

    async def send(self, data: str):
        """Send a JSON-RPC message to the gateway's stdin."""
        if self.proc and self.proc.stdin:
            try:
                self.proc.stdin.write((data + "\n").encode())
                await self.proc.stdin.drain()
            except (BrokenPipeError, ConnectionResetError):
                log.warning("Gateway stdin broken")

    async def _read_stdout(self):
        """Read JSON-RPC responses/events from gateway stdout, forward to WS."""
        assert self.proc and self.proc.stdout
        try:
            async for raw_line in self.proc.stdout:
                line = raw_line.decode().strip()
                if not line:
                    continue

                # Check for gateway.ready
                try:
                    msg = json.loads(line)
                    if (
                        msg.get("method") == "event"
                        and isinstance(msg.get("params"), dict)
                        and msg["params"].get("type") == "gateway.ready"
                    ):
                        self._ready.set()
                except (json.JSONDecodeError, KeyError):
                    pass

                # Forward to WebSocket
                if self._ws:
                    try:
                        await self._ws.send(line)
                    except websockets.ConnectionClosed:
                        break
        except Exception as e:
            log.error("stdout reader error: %s", e)

    async def _read_stderr(self):
        """Log gateway stderr - do not forward to frontend to avoid UI clutter."""
        assert self.proc and self.proc.stderr
        try:
            async for raw_line in self.proc.stderr:
                line = raw_line.decode().strip()
                if line:
                    # Only log locally, don't send to frontend
                    log.info("[gateway stderr] %s", line)
        except Exception as e:
            log.error("stderr reader error: %s", e)

    async def stop(self):
        """Kill the gateway process."""
        if self.proc and self.proc.returncode is None:
            try:
                self.proc.terminate()
                await asyncio.wait_for(self.proc.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self.proc.kill()
            log.info("Gateway process stopped")
        if self._reader_task:
            self._reader_task.cancel()
        if self._stderr_task:
            self._stderr_task.cancel()
        self.proc = None
        self._ws = None


# ── Bridge-local method handlers ─────────────────────────────────────
# These methods are implemented directly by the bridge (not the gateway)
# for operations that the TUI gateway doesn't currently expose.


def _rpc_ok(rid, result):
    return {"jsonrpc": "2.0", "id": rid, "result": result}


def _rpc_err(rid, code, message):
    return {"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": message}}


def _get_hermes_db():
    """Lazy-load the hermes_state database."""
    try:
        sys.path.insert(0, str(HERMES_AGENT_DIR))
        from hermes_state import SessionDB  # type: ignore
        return SessionDB()
    except Exception as exc:
        log.error("cannot load hermes_state: %s", exc)
        return None


async def handle_bridge_method(req: dict) -> Optional[dict]:
    """Return a JSON-RPC response dict if we handle this locally, else None."""
    method = req.get("method")
    rid = req.get("id")
    params = req.get("params") or {}

    if method == "config.check":
        try:
            # Check if hermes-agent has an API key configured
            env_file = HERMES_CONFIG_DIR / ".env"
            if not env_file.exists():
                return _rpc_ok(rid, {"configured": False, "reason": "No .env file found"})
            
            env_content = env_file.read_text()
            has_api_key = any(
                line.strip().startswith(("OPENROUTER_API_KEY=", "OPENAI_API_KEY=", "ANTHROPIC_API_KEY=", "GOOGLE_API_KEY="))
                for line in env_content.splitlines()
            )
            
            if not has_api_key:
                return _rpc_ok(rid, {"configured": False, "reason": "No API key found in .env file"})
            
            return _rpc_ok(rid, {"configured": True})
        except Exception as exc:
            log.error("Failed to check config: %s", exc)
            return _rpc_err(rid, 5004, f"check config failed: {exc}")

    if method == "session.delete":
        session_id = params.get("session_id", "")
        log.info("session.delete called for: %s", session_id)
        if not session_id:
            return _rpc_err(rid, 4006, "session_id required")
        db = _get_hermes_db()
        if db is None:
            log.error("hermes_state unavailable for delete")
            return _rpc_err(rid, 5000, "hermes_state unavailable")
        try:
            ok = db.delete_session(session_id)
            log.info("session.delete result: %s", ok)
            return _rpc_ok(rid, {"deleted": bool(ok), "session_id": session_id})
        except Exception as exc:
            log.error("delete failed: %s", exc)
            return _rpc_err(rid, 5001, f"delete failed: {exc}")

    if method == "session.rename":
        session_id = params.get("session_id", "")
        title = params.get("title", "")
        if not session_id or not title:
            return _rpc_err(rid, 4006, "session_id and title required")
        db = _get_hermes_db()
        if db is None:
            log.error("hermes_state unavailable for rename")
            return _rpc_err(rid, 5000, "hermes_state unavailable")
        try:
            fn = getattr(db, "set_session_title", None) or getattr(db, "rename_session", None) or getattr(db, "set_title", None)
            if fn is None:
                return _rpc_err(rid, 5002, "rename not supported")
            fn(session_id, title)
            return _rpc_ok(rid, {"renamed": True, "title": title})
        except Exception as exc:
            log.error("rename failed: %s", exc)
            return _rpc_err(rid, 5003, f"rename failed: {exc}")

    return None


# ── WebSocket Handler ────────────────────────────────────────────────


async def handle_ws(ws: websockets.WebSocketServerProtocol):
    """Handle a single WebSocket connection, one gateway per connection."""
    remote = ws.remote_address
    log.info("Client connected: %s", remote)

    gateway = GatewayProcess()

    try:
        await gateway.start(ws)

        async for message in ws:
            if isinstance(message, bytes):
                message = message.decode()

            # Parse JSON once
            try:
                parsed = json.loads(message)
            except (json.JSONDecodeError, ValueError):
                await ws.send(json.dumps({
                    "jsonrpc": "2.0",
                    "error": {"code": -32700, "message": "Parse error"},
                    "id": None,
                }))
                continue

            method = parsed.get("method", "")
            rid = parsed.get("id", "")
            log.debug("→ [%s] %s %s", rid, method, json.dumps(parsed.get("params", {}))[:200])

            # Intercept bridge-local methods that the gateway doesn't expose
            try:
                intercepted = await handle_bridge_method(parsed)
                if intercepted is not None:
                    log.debug("← [%s] bridge-handled: %s", rid, json.dumps(intercepted.get("result", intercepted.get("error", {})))[:200])
                    await ws.send(json.dumps(intercepted))
                    continue
            except Exception as exc:
                log.error("bridge intercept error: %s", exc)

            # Forward to gateway
            await gateway.send(message)

    except websockets.ConnectionClosed:
        log.info("Client disconnected: %s", remote)
    except Exception as e:
        log.error("Handler error: %s", e)
    finally:
        await gateway.stop()


# ── Main ─────────────────────────────────────────────────────────────


async def main():
    if not HERMES_AGENT_DIR.exists():
        log.error(
            "hermes-agent directory not found at %s\n"
            "Set HERMES_AGENT_DIR env var to point at your hermes-agent clone.",
            HERMES_AGENT_DIR,
        )
        sys.exit(1)

    if not (HERMES_AGENT_DIR / "tui_gateway").exists():
        log.error(
            "tui_gateway/ not found in %s, is this the right hermes-agent directory?",
            HERMES_AGENT_DIR,
        )
        sys.exit(1)

    log.info("hermes-agent dir: %s", HERMES_AGENT_DIR)
    log.info("Python: %s", resolve_python())
    log.info("Starting WebSocket bridge on ws://%s:%d", BRIDGE_HOST, BRIDGE_PORT)

    stop = asyncio.get_event_loop().create_future()

    def on_signal():
        if not stop.done():
            stop.set_result(None)

    if sys.platform != "win32":
        for sig in (signal.SIGTERM, signal.SIGINT):
            asyncio.get_event_loop().add_signal_handler(sig, on_signal)

    async with serve(
        handle_ws,
        BRIDGE_HOST,
        BRIDGE_PORT,
        origins=None,  # Allow all origins in dev
        max_size=16 * 1024 * 1024,  # 16 MB for large payloads (images, etc.)
    ):
        log.info("Bridge ready, waiting for connections")
        await stop

    log.info("Bridge shutting down")


if __name__ == "__main__":
    asyncio.run(main())
