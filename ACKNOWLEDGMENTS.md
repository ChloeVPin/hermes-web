# Acknowledgments

<p>
  <img src="https://img.shields.io/badge/built%20on-Hermes%20Agent-ffac02?style=flat-square&labelColor=170d02" alt="Built on Hermes Agent" />
  <img src="https://img.shields.io/badge/license-MIT-ffe6cb?style=flat-square&labelColor=170d02" alt="MIT" />
</p>

Hermes-Web is a browser UI for [Hermes Agent](https://github.com/NousResearch/hermes-agent) by [Nous Research](https://nousresearch.com).

Hermes Agent provides the TUI gateway and backend behavior this project connects to. Hermes-Web does not replace that agent. It provides a browser front end for it.

---

## Core Technologies

### Frontend

| Project | Role |
|---|---|
| [React](https://react.dev) | UI runtime |
| [Vite](https://vitejs.dev) | Build tool and dev server |
| [Tailwind CSS](https://tailwindcss.com) | Styling |
| [Lucide](https://lucide.dev) | Icons |

### Bridge

| Project | Role |
|---|---|
| [Tokio](https://tokio.rs) | Async runtime for the Rust bridge |
| [Tungstenite](https://github.com/snapview/tungstenite-rs) | WebSocket implementation in Rust |
| [websockets](https://websockets.readthedocs.io) | Python bridge fallback |

## License

This project is released under the MIT License. See [LICENSE](./LICENSE) for full text.
