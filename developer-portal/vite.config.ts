import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.DEVELOPER_API_PROXY || "http://127.0.0.1:5001",
        changeOrigin: true,
      },
    },
    fs: {
      allow: [resolve(__dirname, "..")],
    },
  },
});
