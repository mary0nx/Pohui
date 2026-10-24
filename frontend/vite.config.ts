/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Cloudflare Pages sets CF_PAGES=1 during its builds. Pages serves only static files, so such a
// build must get the backend address from VITE_API_URL instead of calling its own origin.
const apiUrlRequired = process.env.CF_PAGES === "1" || process.env.REQUIRE_API_URL === "1";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __API_URL_REQUIRED__: JSON.stringify(apiUrlRequired) },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  server: {
    port: 5173,
    host: true,
    proxy: { "/api": "http://localhost:8000", "/health": "http://localhost:8000" },
  },
  preview: { port: 4173, proxy: { "/api": process.env.E2E_API ?? "http://localhost:8000" } },
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    css: false,
  },
});
