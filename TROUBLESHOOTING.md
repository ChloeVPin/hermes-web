# Troubleshooting

<p>
  <img src="https://img.shields.io/badge/scope-common%20issues-ffac02?style=flat-square&labelColor=170d02" alt="Common issues" />
  <img src="https://img.shields.io/badge/bridge-Rust%20or%20Python-ffe6cb?style=flat-square&labelColor=170d02" alt="Bridge" />
</p>

This guide covers common issues with Hermes-Web.

---

## Quick Reference

| Symptom | Likely cause | Fix |
|---|---|---|
| Bridge does not start | Missing bridge binary or Python dependency | Run `bash start.sh` or reinstall with `bash scripts/install.sh` |
| Bridge cannot reach `hermes-agent` | Hermes Agent is missing, moved, or not configured | Verify `HERMES_AGENT_DIR` and the Hermes Agent setup |
| Connection error | Firewall or port conflict | Check ports `9120` and `5173` |
| `hermes-web: command not found` | Launcher was not installed or is not on `PATH` | Re-run the installer and check your shell `PATH` |
| Build fails | Missing Node.js version or broken dependency install | Reinstall dependencies and confirm Node.js 18+ |

---

## Bridge Does Not Start

If `bash start.sh` exits early:

1. Check that the Rust bridge was built, or that Python is available.
2. Confirm `bridge-rs/target/release/hermes-bridge` exists if you expect the Rust path.
3. Confirm `bridge/server.py` exists if you expect the Python fallback.
4. Re-run the installer:

```bash
bash scripts/install.sh
```

## Bridge Cannot Reach Hermes Agent

Hermes-Web needs a working Hermes Agent checkout.

1. Confirm the path:

```bash
echo "$HERMES_AGENT_DIR"
ls "$HERMES_AGENT_DIR"
```

2. If the path is wrong, point it at your Hermes Agent checkout.
3. Make sure Hermes Agent has been configured with an API key.
4. Restart Hermes-Web after any Hermes Agent change.

## Port Conflicts

Hermes-Web uses these ports by default:

| Port | Service |
|---|---|
| `9120` | Bridge |
| `5173` | Vite dev server |

If either port is already in use:

```bash
ss -tlnp | grep -E ':9120|:5173'
```

Then stop the conflicting process, or let Vite choose another port for local development.

## Build Failures

If `npm run build` fails:

1. Reinstall dependencies:

```bash
npm install
```

2. Confirm TypeScript is clean:

```bash
npx tsc --noEmit
```

3. Check the terminal output for missing packages or a bad Hermes Agent path.

## Windows Notes

If the PowerShell installer fails:

1. Confirm Git is installed.
2. Confirm Node.js is installed and on `PATH`.
3. Confirm that PowerShell execution policy allows the installer.
4. Re-run:

```powershell
.\scripts\install.ps1
```

## Still Stuck

If the issue is not covered here, include the following when reporting:

- OS and architecture
- Node.js version
- Rust or Python bridge
- The full terminal output
- Browser console errors, if any
