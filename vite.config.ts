import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // forward API calls to the local AI proxy (server/index.ts on :8787)
      "/api": "http://localhost:8787",
    },
  },
});
