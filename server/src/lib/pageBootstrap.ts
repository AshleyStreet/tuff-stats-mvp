import type { PlayersResponse } from "../domain/types.js";
import type { PublicLeague } from "../leagues/types.js";

export type PageBootstrap = {
  league: PublicLeague;
  seasons: {
    seasons: Array<{ year: string; label: string; slug: string }>;
    defaultSeason: string;
  };
  players?: PlayersResponse;
};

export function injectPageBootstrap(html: string, bootstrap: PageBootstrap) {
  const json = JSON.stringify(bootstrap).replace(/</g, "\\u003c");
  const tag = `<script id="aw-bootstrap" type="application/json">${json}</script>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${tag}\n</head>`);
  }
  return html.replace("</body>", `${tag}\n</body>`);
}
