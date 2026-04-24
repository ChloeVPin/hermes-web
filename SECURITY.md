# Security Policy

<p>
  <img src="https://img.shields.io/badge/disclosure-responsible-fb2c36?style=flat-square&labelColor=170d02" alt="Responsible disclosure" />
  <img src="https://img.shields.io/badge/supported-main%20%26%20latest%20tag-ffac02?style=flat-square&labelColor=170d02" alt="Supported versions" />
  <img src="https://img.shields.io/badge/scope-localhost%20only-ffe6cb?style=flat-square&labelColor=170d02" alt="Localhost only" />
</p>

---

## Reporting a Vulnerability

If you find a security issue in Hermes-Web, do not open a public issue.

| Repository state | How to report |
|---|---|
| Private (current) | Contact the repository owner directly through GitHub or via the contact method on the owner's profile |
| Public | Use GitHub Security Advisories for responsible disclosure |

### What to Include

1. A short description of the issue
2. Steps to reproduce
3. Potential impact
4. A suggested fix, if you have one

## Supported Versions

| Version | Supported |
|---|---|
| Latest tagged release | Yes |
| Current `main` branch | Yes, while the current release is active |
| Older tags | No |

## Security Practices

- Keep `hermes-agent` up to date
- Prefer the Rust bridge when available
- Run the bridge on localhost only
- Do not expose port `9120` to the public internet
- Keep Node.js and dependencies updated

## Network Surface

Default ports used by Hermes-Web:

| Port | Service | Exposure |
|---|---|---|
| `9120` | Bridge (WebSocket, JSON-RPC) | Localhost only |
| `5173` | Vite dev server | Localhost only |

Neither port should be exposed to the public internet in normal use.
