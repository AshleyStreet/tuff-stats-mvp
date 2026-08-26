import { useEffect } from "react";
import "./marketing.css";

const DEMO_MAIL = "hello@afterwhistle.ca";
const DEMO_HREF = `mailto:${DEMO_MAIL}?subject=Afterwhistle%20demo`;
const LIVE_LEAGUE_URL = "https://tuff.afterwhistle.ca";

const FAQS = [
  {
    q: "Do you replace our WordPress site?",
    a: "No. Afterwhistle reads SportsPress (or demo data) and hosts the stats experience on your subdomain. Your league site stays where it is."
  },
  {
    q: "What sports do you support?",
    a: "Flag football, softball, and soccer today — each with its own stat layout. More sports plug in as presentation schemas, not one-off forks."
  },
  {
    q: "Can each league look different?",
    a: "Yes. Hostnames, colors, copy, and sport UI are per tenant. Fans never see another league’s brand."
  },
  {
    q: "How fast can we go live?",
    a: "If SportsPress is already publishing tables and lists, we can stand up a branded board quickly. Empty or non-SportsPress sources start as a fixture demo, then upgrade to live ingest."
  },
  {
    q: "Is there write-back to our league system?",
    a: "Never. Afterwhistle is read-only ingest — normalize — present. Captains and admins on Afterwhistle don’t push changes into WordPress."
  }
] as const;

export function MarketingHome() {
  useEffect(() => {
    document.title = "Afterwhistle · White-label league stats";
    document.documentElement.classList.add("marketing");
    return () => {
      document.documentElement.classList.remove("marketing");
    };
  }, []);

  return (
    <div className="aw-shell">
      <div className="aw-atmosphere" aria-hidden="true" />
      <div className="aw-field" aria-hidden="true" />

      <header className="aw-top">
        <span className="aw-wordmark" aria-current="page">
          Afterwhistle
        </span>
        <nav className="aw-nav" aria-label="Primary">
          <a href="#how">How it works</a>
          <a href="#product">Product</a>
          <a href="#faq">FAQ</a>
          <a className="aw-nav-cta" href={DEMO_HREF}>
            Book a demo
          </a>
        </nav>
      </header>

      <main>
        <section className="aw-hero">
          <p className="aw-brand aw-rise">Afterwhistle</p>
          <h1 className="aw-headline aw-rise aw-rise-2">
            Your league’s stats board.
            <span className="aw-headline-break"> Their WordPress stays put.</span>
          </h1>
          <p className="aw-lede aw-rise aw-rise-3">
            White-label standings, schedule, and player cards — live from SportsPress, branded as
            your club.
          </p>
          <div className="aw-cta aw-rise aw-rise-4">
            <a className="aw-btn aw-btn-primary" href={DEMO_HREF}>
              Book a demo
            </a>
            <a className="aw-btn aw-btn-ghost" href={LIVE_LEAGUE_URL}>
              See a live league
            </a>
          </div>
        </section>

        <section className="aw-proof" aria-label="Built for rec leagues">
          <p className="aw-proof-label">Built for the leagues that already run on SportsPress</p>
          <ul className="aw-proof-list">
            <li>Flag football</li>
            <li>Softball</li>
            <li>Soccer</li>
            <li>Multi-tenant</li>
            <li>Read-only ingest</li>
          </ul>
        </section>

        <section className="aw-section aw-problem" aria-labelledby="aw-problem-title">
          <h2 id="aw-problem-title" className="aw-section-title">
            The board fans actually open
          </h2>
          <p className="aw-section-lede">
            Most clubs already track games in WordPress. What they lack is a fast, branded stats
            experience — without migrating off SportsPress or rebuilding the whole site.
          </p>
          <ul className="aw-pain">
            <li>
              <strong>Ugly or buried tables</strong>
              <span>Standings live in plugin pages nobody bookmarks.</span>
            </li>
            <li>
              <strong>One site, many brands</strong>
              <span>You can’t spin a second league without cloning the whole stack.</span>
            </li>
            <li>
              <strong>Afraid to rip out WordPress</strong>
              <span>Registration, news, and schedules already work there.</span>
            </li>
          </ul>
        </section>

        <section className="aw-section aw-product" id="product" aria-labelledby="aw-product-title">
          <div className="aw-product-copy">
            <h2 id="aw-product-title" className="aw-section-title">
              Same data. Sharper board.
            </h2>
            <p className="aw-section-lede">
              Afterwhistle ingests what SportsPress already publishes, then presents standings,
              schedule, and players under your hostname and colors — like{" "}
              <a href={LIVE_LEAGUE_URL}>tuff.afterwhistle.ca</a>.
            </p>
          </div>
          <div className="aw-preview" aria-hidden="true">
            <div className="aw-preview-chrome">
              <span>tuff.afterwhistle.ca</span>
            </div>
            <div className="aw-preview-body">
              <div className="aw-preview-brand">
                <strong>TUFF</strong>
                <span>Toronto United Flag Football</span>
              </div>
              <div className="aw-preview-grid">
                <div className="aw-preview-panel">
                  <p className="aw-preview-kicker">Standings</p>
                  <ul>
                    <li>
                      <span>1</span> Brawlers <em>6–1</em>
                    </li>
                    <li>
                      <span>2</span> Rhinos <em>5–2</em>
                    </li>
                    <li>
                      <span>3</span> Cobras <em>4–3</em>
                    </li>
                  </ul>
                </div>
                <div className="aw-preview-panel">
                  <p className="aw-preview-kicker">Leaders</p>
                  <ul>
                    <li>
                      Rec TD <em>14</em>
                    </li>
                    <li>
                      INT <em>9</em>
                    </li>
                    <li>
                      SACK <em>11</em>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="aw-section aw-how" id="how" aria-labelledby="aw-how-title">
          <h2 id="aw-how-title" className="aw-section-title">
            How it works
          </h2>
          <p className="aw-section-lede">Three steps. No write-back to their site.</p>
          <ol className="aw-steps">
            <li>
              <span className="aw-step-num">01</span>
              <div>
                <strong>Ingest</strong>
                <p>We read SportsPress tables, lists, and events — or start from a fixture demo.</p>
              </div>
            </li>
            <li>
              <span className="aw-step-num">02</span>
              <div>
                <strong>Your brand</strong>
                <p>Hostname, colors, copy, and sport layout — each league is its own tenant.</p>
              </div>
            </li>
            <li>
              <span className="aw-step-num">03</span>
              <div>
                <strong>Live board</strong>
                <p>Fans and captains get a fast stats app on your subdomain.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="aw-section aw-audience" aria-labelledby="aw-audience-title">
          <h2 id="aw-audience-title" className="aw-section-title">
            Who it’s for
          </h2>
          <p className="aw-section-lede">
            Rec and club leagues that already live in WordPress — and operators who want one stack
            for many brands.
          </p>
          <ul className="aw-audience-list">
            <li>
              <strong>League operators</strong>
              <p>One deploy, many hostnames. Add a tenant without forking the codebase.</p>
            </li>
            <li>
              <strong>Club captains</strong>
              <p>Players, schedule, and cards that feel like the club — not a generic plugin skin.</p>
            </li>
            <li>
              <strong>Multi-sport orgs</strong>
              <p>Softball tonight, soccer tomorrow — presentation follows the sport, not a hardcode.</p>
            </li>
          </ul>
        </section>

        <section className="aw-mid-cta" aria-label="Book a demo">
          <h2 className="aw-section-title">See your league on Afterwhistle</h2>
          <p className="aw-section-lede">
            Send your SportsPress URL. We’ll probe it and show you what a branded board looks like.
          </p>
          <div className="aw-cta">
            <a className="aw-btn aw-btn-primary" href={DEMO_HREF}>
              Book a demo
            </a>
            <a className="aw-btn aw-btn-ghost" href={LIVE_LEAGUE_URL}>
              Open live TUFF board
            </a>
          </div>
        </section>

        <section className="aw-section aw-faq" id="faq" aria-labelledby="aw-faq-title">
          <h2 id="aw-faq-title" className="aw-section-title">
            FAQ
          </h2>
          <div className="aw-faq-list">
            {FAQS.map((item) => (
              <details key={item.q} className="aw-faq-item">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="aw-close" aria-labelledby="aw-close-title">
          <h2 id="aw-close-title" className="aw-brand aw-brand-sm">
            Afterwhistle
          </h2>
          <p className="aw-headline aw-headline-sm">
            Ready when the final whistle blows —
            <span className="aw-headline-break"> the board is already live.</span>
          </p>
          <div className="aw-cta">
            <a className="aw-btn aw-btn-primary" href={DEMO_HREF}>
              Book a demo
            </a>
          </div>
        </section>
      </main>

      <footer className="aw-foot">
        <span>Afterwhistle</span>
        <div className="aw-foot-links">
          <a href={LIVE_LEAGUE_URL}>Live demo</a>
          <a href={`mailto:${DEMO_MAIL}`}>Contact</a>
        </div>
      </footer>
    </div>
  );
}
