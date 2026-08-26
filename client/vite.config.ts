import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: false,
        xfwd: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const host = req.headers.host;
            if (!host) return;
            proxyReq.setHeader("host", host);
            proxyReq.setHeader("x-forwarded-host", host);
          });
        }
      }
    }
  }
});
