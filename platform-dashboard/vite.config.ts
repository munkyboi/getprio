import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const port = Number(env.PLATFORM_DASHBOARD_PORT || 7100);

  return {
    envDir: "..",
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port,
      strictPort: true
    }
  };
});
