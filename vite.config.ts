import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BRIDGE_URL = process.env.HERMES_BRIDGE_URL ?? "http://127.0.0.1:9120";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    proxy: {
      "/ws": {
        target: BRIDGE_URL,
        ws: true,
      },
    },
  },
});
