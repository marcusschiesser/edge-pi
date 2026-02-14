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
  },
  preview: {
    headers: webContainerHeaders,
  },
});
