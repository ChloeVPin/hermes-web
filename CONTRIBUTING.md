# Contributing to Hermes-Web

<p>
  <img src="https://img.shields.io/badge/PRs-welcome-ffac02?style=flat-square&labelColor=170d02" alt="PRs welcome" />
  <img src="https://img.shields.io/badge/style-TypeScript%20strict-ffe6cb?style=flat-square&labelColor=170d02" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/node-18%2B-ffff89?style=flat-square&labelColor=170d02" alt="Node 18+" />
</p>

Hermes-Web is a browser UI for [Hermes Agent](https://github.com/NousResearch/hermes-agent). The UI communicates with the agent through the TUI gateway, so changes should preserve that contract.

---

## Getting Started

```bash
git clone git@github.com:ChloeVPin/hermes-web.git
cd hermes-web
bash scripts/install.sh
```

## Development

```bash
npm run dev          # start dev server
npx tsc --noEmit     # type check
npm run build        # production build
```

The bridge must be running separately.

### Rust bridge

```bash
cd bridge-rs
cargo build --release
HERMES_AGENT_DIR=../hermes-agent ./target/release/hermes-bridge
```

### Python bridge

```bash
HERMES_AGENT_DIR=../hermes-agent python bridge/server.py
```

## Project Layout

| Path | Purpose |
|---|---|
| `src/lib/` | Gateway client, types, and React hook |
| `src/components/hermes/` | UI components |
| `bridge/` | Python WebSocket bridge |
| `bridge-rs/` | Rust WebSocket bridge |
| `patches/` | Speed patches for `hermes-agent` |
| `scripts/` | Installers and launch helpers |

## Guidelines

- Keep TypeScript strict clean with `npx tsc --noEmit`
- Remove unused imports during refactors
- Prefer small, focused changes
- Test both light and dark theme output
- If you touch `use-gateway.ts` or `gateway-client.ts`, verify event handling and reconnect behavior

## Commit Style

Use concise, descriptive commit messages:

```text
fix: handle gateway disconnect during tool execution
feat: add voice transcript display
refactor: split sidebar into tab components
```

Common prefixes:

| Prefix | Meaning |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `docs` | Documentation only |
| `chore` | Build, tooling, or maintenance |
| `perf` | Performance improvement |

## Reporting Issues

Please include:

1. Operating system and architecture
2. Node.js version from `node --version`
3. Whether you used the Rust or Python bridge
4. Browser console errors, if any
5. Steps to reproduce

## Acknowledgments

Hermes-Web depends on [Hermes Agent](https://github.com/NousResearch/hermes-agent) by Nous Research. The TUI gateway in that project provides the backend behavior this UI connects to.
