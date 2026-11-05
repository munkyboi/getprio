import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const port = Number(env.FRONTEND_PORT || 5173);

  return {
    envDir: "..",
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@vendor": fileURLToPath(new URL("./src/vendor", import.meta.url)) } },
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
