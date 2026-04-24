# Performance Notes

<p>
  <img src="https://img.shields.io/badge/scope-local%20reference-ffac02?style=flat-square&labelColor=170d02" alt="Local reference" />
  <img src="https://img.shields.io/badge/guarantees-none-fb2c36?style=flat-square&labelColor=170d02" alt="No guarantees" />
</p>

These notes are a local reference, not a guarantee. Actual results vary by operating system, hardware, installed dependencies, and whether the Rust or Python bridge is in use.

---

## Bridge

| Bridge | Notes |
|---|---|
| Rust | Should start faster than the Python fallback when built |
| Python | Used as the fallback path when Rust is not available |

## Frontend

| Command | Purpose |
|---|---|
| `npm run build` | Verify the production bundle |
| `npm run dev` | Development only |

## What Affects Speed

- Whether `node_modules` is already installed
- Whether the Rust bridge is already built
- Network access during install
- The local Hermes Agent checkout and Python environment

## Measurement Guidance

- If you need a benchmark, run it on your own machine.
- Record the date, host OS, and bridge backend with every measurement.
- Avoid treating any single local measurement as a project-wide promise.

## Benchmark Template

When posting a benchmark, include the fields below so results can be compared:

```text
Date:              YYYY-MM-DD
Host OS:           (e.g. Ubuntu 24.04, macOS 14, Windows 11)
Architecture:      (e.g. x86_64, arm64)
Node.js version:   (e.g. 20.11.1)
Bridge backend:    (rust | python)
Cold or warm:      (fresh install vs cached)
Measurement:       (what was timed, and how)
Result:            (value with unit)
```
