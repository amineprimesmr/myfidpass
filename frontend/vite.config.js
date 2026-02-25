import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: true, // accessible depuis le réseau (ex. iPhone sur la même WiFi)
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
