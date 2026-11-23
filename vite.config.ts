import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "0.0.0.0",
    watch: { ignored: ["**/src-tauri/**"], usePolling: true },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
});
