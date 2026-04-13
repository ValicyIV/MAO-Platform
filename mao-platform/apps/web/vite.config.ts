import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Makes production (Docker nginx) stack traces usable; slightly larger assets.
    sourcemap: true,
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: process.env.VITE_WS_URL ?? "ws://localhost:8000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
