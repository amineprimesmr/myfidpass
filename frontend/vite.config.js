import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const apiProxyTarget = process.env.VITE_PROXY_TARGET || "http://localhost:3001";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/** En dev, servir index.html pour toutes les routes SPA (/login, /app, etc.) pour éviter 404 au clic. */
function spaFallback() {
  return {
    name: "spa-fallback",
    apply: "serve",
    configureServer(server) {
      const root = server.config.root || __dirname;
      const handler = (req, res, next) => {
        if (req.method !== "GET" || req.url == null) return next();
        if (res.headersSent) return next();
        const path = req.url.split("?")[0];
        if (path.startsWith("/api")) return next();
        if (path.includes(".") && !path.endsWith(".html")) return next();
        if (path.startsWith("/src/") || path.startsWith("/@") || path.startsWith("/node_modules") || path.startsWith("/assets/")) return next();
        try {
          // Relecture a chaque requete pour refléter immédiatement les modifs de index.html.
          const indexHtml = readFileSync(join(root, "index.html"), "utf-8");
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(indexHtml);
        } catch (e) {
          next(e);
        }
      };
      try {
        if (Array.isArray(server.middlewares.stack)) {
          server.middlewares.stack.unshift({ route: "", handle: handler });
        } else {
          server.middlewares.use(handler);
        }
      } catch (_) {
        server.middlewares.use(handler);
      }
    },
  };
}

export default defineConfig({
  appType: "spa",
  plugins: [react(), tailwindcss(), spaFallback()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Réduire la lenteur en dev : pre-bundle des grosses deps dès le démarrage
  optimizeDeps: {
    include: ["html5-qrcode", "three", "react", "react-dom"],
  },
  server: {
    port: 5174,
    host: true,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
