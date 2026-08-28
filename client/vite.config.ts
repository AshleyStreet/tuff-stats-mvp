import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function injectGaSnippet(gaId: string) {
  return `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  window.__gtagReady = new Promise(function(resolve) {
    var script = document.querySelector('script[src*="gtag/js?id=${gaId}"]');
    if (!script) { resolve(); return; }
    script.addEventListener('load', function() { resolve(); }, { once: true });
  });
  gtag('js', new Date());
  gtag('config', '${gaId}', { send_page_view: false });
</script>`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const gaId = env.VITE_GA_MEASUREMENT_ID?.trim();

  return {
    plugins: [
      react(),
      {
        name: "inject-ga-snippet",
        transformIndexHtml(html) {
          if (!gaId) return html;
          return html.replace("</head>", `${injectGaSnippet(gaId)}\n</head>`);
        }
      }
    ],
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
  };
});
