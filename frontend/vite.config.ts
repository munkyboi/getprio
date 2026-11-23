import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const surface = env.VITE_APP_SURFACE || "legacy";
  if (!["legacy", "marketing", "customer", "vendor"].includes(surface)) {
    throw new Error("Unknown application surface.");
  }
  const appEntry = surface === "legacy"
    ? "./src/App.tsx"
    : `./src/surfaces/${surface[0].toUpperCase()}${surface.slice(1)}App.tsx`;
  const port = Number(env.FRONTEND_PORT || 5173);

  return {
    envDir: "..",
    cacheDir: `../.cache/vite-${surface}`,
    plugins: [react()],
    resolve: {
      alias: {
        "@shared": path.resolve(__dirname, "../shared"),
        "@vendor": path.resolve(__dirname, "src/vendor"),
        "@surface-app": fileURLToPath(new URL(appEntry, import.meta.url))
      }
    },
    optimizeDeps: {
      include: ["qr-code-styling"]
    },
    server: {
      host: "0.0.0.0",
      port,
      strictPort: true
    },
    build: { outDir: surface === "legacy" ? "dist" : `dist-${surface}` }
  };
});
