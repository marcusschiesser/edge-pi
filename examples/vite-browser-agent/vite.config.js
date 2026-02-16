import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webContainerHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  server: {
    headers: webContainerHeaders,
    proxy: {
      "/openai": {
        target: "https://api.openai.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openai/, ""),
      },
    },
  },
  preview: {
    headers: webContainerHeaders,
  },
});
