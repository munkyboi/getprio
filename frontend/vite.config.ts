import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const surface = env.VITE_APP_SURFACE || "legacy";
  if (!["legacy", "marketing", "customer", "vendor"].includes(surface)) throw new Error("Unknown application surface.");
  const appEntry = surface === "legacy" ? "./src/App.tsx" : `./src/surfaces/${surface[0].toUpperCase()}${surface.slice(1)}App.tsx`;
  const port = Number(env.FRONTEND_PORT || 5173);

  return {
    envDir: "..",
    cacheDir: `../.cache/vite-${surface}`,
    build: { outDir: surface === "legacy" ? "dist" : `dist-${surface}`, manifest: true },
    plugins: [react(), tailwindcss(), {
      name: "getprio-surface-identity",
      transformIndexHtml: { order: "pre", handler(html) {
        const entry = surface === "marketing" ? html.replace('/src/main.jsx', '/src/marketing/main.tsx') : html;
        return entry.replace("</head>", `<meta name="getprio-app-surface" content="${surface}" /></head>`);
      } },
      generateBundle(_options, bundle) {
        if (surface === "marketing") {
          const modules = Object.values(bundle).flatMap(item => item.type === "chunk" ? item.moduleIds : []);
          const forbidden = modules.filter(id => id.includes("/@mantine/"));
          if (forbidden.length) this.error(`Marketing must not bundle Mantine: ${forbidden.join(", ")}`);
          this.emitFile({ type: "asset", fileName: "ui-dependency-manifest.json", source: JSON.stringify({ componentSystem: "shadcn/ui Base Nova", entry: "src/marketing/main.tsx", mantineModules: forbidden, components: [...new Set(modules.filter(id => id.includes("/src/vendor/components/ui/")).map(id => id.slice(id.indexOf("/src/vendor/components/ui/") + 1)))].sort() }) });
        }
        const pages = [...new Set(Object.values(bundle).flatMap(item => item.type === "chunk" ? item.moduleIds.filter(id => id.includes("/src/pages/")).map(id => id.slice(id.indexOf("/src/pages/") + 1)) : []))].sort();
        this.emitFile({ type: "asset", fileName: "surface-manifest.json", source: JSON.stringify({ surface, sourceCommit: env.VITE_DEPLOY_SHA || "local", api: env.VITE_API_URL || null, pages }) });
      }
    }],
    resolve: { alias: { "@surface-app": fileURLToPath(new URL(appEntry, import.meta.url)), "@vendor": fileURLToPath(new URL("./src/vendor", import.meta.url)) } },
    optimizeDeps: {
      include: ["qr-code-styling"]
    },
    server: {
      host: "0.0.0.0",
      port,
      strictPort: true,
      fs: { allow: [fileURLToPath(new URL(".", import.meta.url)),
        ...["typography.css", "fonts/aleo/aleo-variable.ttf", "modalWheel.ts", "timezones.ts"].map(file => fileURLToPath(new URL(`../shared/${file}`, import.meta.url)))] }
    }
  };
});
