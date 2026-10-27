import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: {
      "/api/v1/auth": {
        target:
          mode === "e2e" ? "http://127.0.0.1:18081" : "http://127.0.0.1:8081",
      },
      "/api/v1/internal": {
        target:
          mode === "e2e" ? "http://127.0.0.1:18080" : "http://127.0.0.1:8080",
      },
    },
  },
}));
