import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/* 127.0.0.1 : évite que « localhost » résolve en ::1 alors que Node écoute en IPv4 → proxy Vite en échec silencieux. */
const apiProxyTarget = process.env.VITE_PROXY_TARGET || "http://127.0.0.1:3001";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Avertit si l’API n’est pas joignable (évite « Connexion impossible » sans comprendre pourquoi).
 */
function fidpassApiReachableCheck() {
  return {
    name: "fidpass-api-reachable-check",
    apply: "serve",
    configureServer(server) {
      const httpServer = server.httpServer;
      if (!httpServer) return;
      httpServer.once("listening", () => {
        setTimeout(() => void runHealthCheck(), 600);
      });
    },
  };
}

async function runHealthCheck() {
  const viteApiUrl = (process.env.VITE_API_URL || "").trim();
  let healthUrl;
  if (viteApiUrl) {
    try {
      healthUrl = new URL("/api/health", viteApiUrl.replace(/\/$/, ""));
    } catch {
      return;
    }
  } else {
    healthUrl = new URL("/api/health", apiProxyTarget.replace(/\/$/, ""));
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const res = await fetch(healthUrl.href, { signal: ac.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(
        `\n[Fidpass] ${healthUrl.href} → HTTP ${res.status}. L’API répond en erreur ; voir le terminal du backend.\n`
      );
    }
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (viteApiUrl) {
      console.warn(`\n[Fidpass] Impossible de joindre ${healthUrl.href} (${msg}). Vérifiez VITE_API_URL.\n`);
    } else {
      console.warn(
        "\n\x1b[33m╔══════════════════════════════════════════════════════════════════╗\n" +
          "║  Fidpass — API locale introuvable (attendue sur le port 3001)     ║\n" +
          "╠══════════════════════════════════════════════════════════════════╣\n" +
          "║  Ouvrez un terminal à la RACINE du dépôt (pas seulement frontend)║\n" +
          "║    npm run backend          ou          npm start                 ║\n" +
          "║  « npm run dev » dans frontend/ ne démarre pas l’API.            ║\n" +
          "╚══════════════════════════════════════════════════════════════════╝\x1b[0m\n"
      );
    }
  }
}

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
        // Laisser Vite servir les .html statiques (ex. card-beam-reversed.html pour l'iframe)
        if (path.endsWith(".html") && path !== "/index.html") return next();
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
  plugins: [react(), tailwindcss(), spaFallback(), fidpassApiReachableCheck()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        landingAiAgency: resolve(__dirname, "landing-ai-agency.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Réduire la lenteur en dev : pre-bundle des grosses deps dès le démarrage
  optimizeDeps: {
    include: ["html5-qrcode", "three", "react", "react-dom", "hls.js"],
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
