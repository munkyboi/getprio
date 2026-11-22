import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const port = Number(env.FRONTEND_PORT || 5173);

  return {
    envDir: "..",
    plugins: [react()],
    resolve: {
      alias: {
        "@shared": path.resolve(__dirname, "../shared"),
        "@vendor": path.resolve(__dirname, "src/vendor")
      }
    },
    optimizeDeps: {
      include: ["qr-code-styling"]
    },
    server: {
      host: "0.0.0.0",
      port,
      strictPort: true
    }
  };
});
