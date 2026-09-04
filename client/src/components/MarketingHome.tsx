import { useEffect } from "react";
import { TradingCard } from "./TradingCard";
import "./marketing.css";
import { LeaguePreviewProvider } from "../league/LeagueProvider";
import { tuffPublicLeague } from "../league/tuff";
import { trackEvent, trackPageView } from "../lib/analytics";
import { setPageSeo } from "../lib/seo";
import { marketingSampleCard } from "../lib/marketingSampleCard";

const DEMO_MAIL = "hello@afterwhistle.ca";
const DEMO_HREF = `mailto:${DEMO_MAIL}?subject=Afterwhistle%20demo`;
const LIVE_LEAGUE_URL = "https://tuff.afterwhistle.ca";

const FAQS = [
  {
    q: "Do we have to replace our website?",
    a: "No. Keep your site for registration, news, and everything else. Afterwhistle is just the stats board people open after the whistle."
  },
  {
    q: "What sports do you cover?",
    a: "Flag football, softball, and soccer right now — with the stats each sport actually cares about. More sports when leagues need them."
  },
  {
    q: "Can our league look like our club?",
    a: "Yes. Your colors, your name, your link. Fans never see another league’s branding on Club plans."
  },
  {
    q: "How much does it cost?",
    a: "League boards start at $39/month on your Afterwhistle subdomain. Club plans with a custom domain and white-label branding are $99/month. We also offer a free Pilot while you try it out. One-time setup applies for new leagues — book a demo for a quote."
  },
  {
    q: "How long until we’re live?",
    a: "If you already post standings and stats online, we can usually get a branded board up quickly. If not, we start with a demo and switch on live data when you’re ready."
  },
  {
    q: "Will this mess with our current site?",
    a: "No. We only read what you already publish. We don’t edit or overwrite anything on your site."
  }
] as const;

const PRICING = [
  {
    id: "pilot",
    name: "Pilot",
    price: "Free",
    period: "to try it",
    blurb: "See your league on a board before you commit.",
    features: [
      "yourleague.afterwhistle.ca",
      "Standings, schedule & player cards",
      "Shareable links for players & games",
      "Afterwhistle footer badge"
    ],
    cta: "Start a pilot",
    featured: false
  },
  {
    id: "league",
    name: "League",
    price: "$39",
    period: "/ month",
    blurb: "A branded board fans will actually bookmark.",
    features: [
      "Custom colors & club logo",
      "Full stats board + trading cards",
      "SEO & social link previews",
      "Email support"
    ],
    cta: "Get League",
    featured: true
  },
  {
    id: "club",
    name: "Club",
    price: "$99",
    period: "/ month",
    blurb: "For multi-league clubs that want their own domain.",
    features: [
      "Custom domain (stats.yourclub.ca)",
      "White-label — no Afterwhistle badge",
      "Captain tools & bulk card print",
      "Priority onboarding & support"
    ],
    cta: "Get Club",
    featured: false
  }
] as const;

function pricingMail(plan: string) {
  return `mailto:${DEMO_MAIL}?subject=${encodeURIComponent(`Afterwhistle ${plan} plan`)}`;
}

function trackMarketingClick(target: string) {
  trackEvent("marketing_click", { target });
}

export function MarketingHome() {
  const sampleCard = marketingSampleCard();

  useEffect(() => {
    const title = "Afterwhistle · League stats boards";
    document.documentElement.classList.add("marketing");
    setPageSeo({
      title,
      description:
        "Standings, schedules, and player cards for rec leagues — under your club's name and colors, without replacing your existing website.",
      siteName: "Afterwhistle"
    });
    trackPageView("/", title);
    return () => {
      document.documentElement.classList.remove("marketing");
    };
  }, []);

  return (
    <div className="aw-shell">
      <header className="aw-top">
        <span className="aw-wordmark" aria-current="page">
          Afterwhistle
        </span>
        <nav className="aw-nav" aria-label="Primary">
          <a href="#how" onClick={() => trackMarketingClick("nav_how")}>How it works</a>
          <a href="#product" onClick={() => trackMarketingClick("nav_product")}>The board</a>
          <a href="#pricing" onClick={() => trackMarketingClick("nav_pricing")}>Pricing</a>
          <a href="#faq" onClick={() => trackMarketingClick("nav_faq")}>FAQ</a>
          <a className="aw-nav-cta" href={DEMO_HREF}
            onClick={() => trackMarketingClick("book_demo")}>
            Book a demo
          </a>
        </nav>
      </header>

      <main>
        <section className="aw-hero">
          <div className="aw-hero-media" aria-hidden="true">
            <img
              className="aw-hero-img"
              src="/marketing/aw-hero-field.png"
              alt=""
              width={1920}
              height={1080}
              fetchPriority="high"
            />
            <div className="aw-hero-shade" />
          </div>
          <div className="aw-hero-copy">
            <p className="aw-brand aw-rise">Afterwhistle</p>
            <h1 className="aw-headline aw-rise aw-rise-2">
              The stats board your league deserves.
              <span className="aw-headline-break"> Keep the website you already have.</span>
            </h1>
            <p className="aw-lede aw-rise aw-rise-3">
              Standings, schedule, and player cards — under your club’s name and colors, without
              tearing up WordPress.
            </p>
            <div className="aw-cta aw-rise aw-rise-4">
              <a className="aw-btn aw-btn-primary" href={DEMO_HREF}
            onClick={() => trackMarketingClick("book_demo")}>
                Book a demo
              </a>
              <a className="aw-btn aw-btn-ghost" href={LIVE_LEAGUE_URL}
            onClick={() => trackMarketingClick("live_demo")}>
                See a live league
              </a>
            </div>
          </div>
        </section>

        <section className="aw-proof" aria-label="Built for rec leagues">
          <p className="aw-proof-label">Made for rec leagues that already post stats online</p>
          <ul className="aw-proof-list">
            <li>Flag football</li>
            <li>Softball</li>
            <li>Soccer</li>
            <li>Standings &amp; schedule</li>
            <li>Player cards</li>
          </ul>
        </section>

        <section className="aw-section aw-problem aw-split" aria-labelledby="aw-problem-title">
          <div className="aw-split-copy aw-problem-copy">
            <h2 id="aw-problem-title" className="aw-section-title">
              Fans want a board they can actually use
            </h2>
            <p className="aw-section-lede">
              You’re already tracking games. What’s missing is a clean place for standings and
              player stats — without rebuilding the whole site.
            </p>
            <ul className="aw-pain">
              <li>
                <strong>Stats are hard to find</strong>
                <span>Buried in old tables nobody bookmarks after the game.</span>
              </li>
              <li>
                <strong>Running more than one league is painful</strong>
                <span>A second brand usually means copying the whole website.</span>
              </li>
              <li>
                <strong>You don’t want to start over</strong>
                <span>Registration, news, and schedules already work where they are.</span>
              </li>
            </ul>
          </div>
          <figure className="aw-shot aw-shot-problem">
            <img
              src="/marketing/aw-problem-contrast.png"
              alt="Old standings table next to a clean branded stats board"
              width={1400}
              height={1050}
              loading="lazy"
            />
          </figure>
        </section>

        <section className="aw-section aw-product aw-split aw-split--flip" id="product" aria-labelledby="aw-product-title">
          <div className="aw-split-copy aw-product-copy">
            <h2 id="aw-product-title" className="aw-section-title">
              Same numbers. Better board.
            </h2>
            <p className="aw-section-lede">
              We take the standings and player stats you already post and put them on a fast board
              that looks like your club — like{" "}
              <a
                href={LIVE_LEAGUE_URL}
                onClick={() => trackMarketingClick("live_demo")}
              >
                tuff.afterwhistle.ca
              </a>.
            </p>
          </div>
          <figure className="aw-shot aw-shot-board">
            <img
              src="/marketing/aw-product-board.png"
              alt="League board with players, standings, and leaders"
              width={1600}
              height={900}
              loading="lazy"
            />
            <figcaption>Standings, leaders, and roster cards in one place</figcaption>
          </figure>
        </section>

        <section className="aw-section aw-cards-media aw-split aw-split--flip" aria-labelledby="aw-cards-title">
          <div className="aw-split-copy aw-cards-copy">
            <h2 id="aw-cards-title" className="aw-section-title">
              Cards players actually share
            </h2>
            <p className="aw-section-lede">
              Season stats on a trading card you can print or send — not another spreadsheet
              screenshot.
            </p>
          </div>
          <div className="aw-card-preview">
            <LeaguePreviewProvider league={tuffPublicLeague}>
              <TradingCard card={sampleCard} />
            </LeaguePreviewProvider>
          </div>
        </section>

        <section className="aw-section aw-how aw-how-stack" id="how" aria-labelledby="aw-how-title">
          <div className="aw-how-intro">
            <h2 id="aw-how-title" className="aw-section-title">
              How it works
            </h2>
            <p className="aw-section-lede">Three steps. Your website stays where it is.</p>
          </div>
          <figure className="aw-shot aw-shot-how">
            <img
              src="/marketing/aw-how-steps.png"
              alt="Pull your stats, add your brand, go live"
              width={1400}
              height={1050}
              loading="lazy"
            />
          </figure>
          <ol className="aw-steps aw-steps-row">
            <li>
              <span className="aw-step-num">01</span>
              <div>
                <strong>Pull your stats</strong>
                <p>We use the standings and player stats you already post — or start with a demo.</p>
              </div>
            </li>
            <li>
              <span className="aw-step-num">02</span>
              <div>
                <strong>Make it yours</strong>
                <p>Your link, your colors, your club name. Each league looks like its own.</p>
              </div>
            </li>
            <li>
              <span className="aw-step-num">03</span>
              <div>
                <strong>Go live</strong>
                <p>Fans and captains get a fast board they can open on any phone.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="aw-section aw-audience" aria-labelledby="aw-audience-title">
          <div className="aw-audience-head">
            <h2 id="aw-audience-title" className="aw-section-title">
              Who it’s for
            </h2>
            <p className="aw-section-lede">
              Rec leagues and clubs that already run on WordPress — and people running more than one
              brand.
            </p>
          </div>
          <figure className="aw-shot aw-shot-audience">
            <img
              src="/marketing/aw-audience-field.png"
              alt="Adult rec league game under the lights"
              width={1600}
              height={900}
              loading="lazy"
            />
          </figure>
          <ul className="aw-audience-list">
            <li>
              <strong>League directors</strong>
              <p>One place for every league. Add a club without rebuilding everything.</p>
            </li>
            <li>
              <strong>Captains</strong>
              <p>Rosters, schedule, and cards that feel like your team — not a generic plugin page.</p>
            </li>
            <li>
              <strong>Multi-sport clubs</strong>
              <p>Softball one night, soccer the next — the board shows the right stats for each.</p>
            </li>
          </ul>
        </section>

        <section className="aw-section aw-pricing" id="pricing" aria-labelledby="aw-pricing-title">
          <div className="aw-pricing-head">
            <h2 id="aw-pricing-title" className="aw-section-title">
              Simple pricing
            </h2>
            <p className="aw-section-lede">
              TUFF runs free forever as our founding partner. Every other league gets the same board
              — pick the plan that fits your club.
            </p>
          </div>

          <div className="aw-pricing-founder">
            <div className="aw-pricing-founder-copy">
              <span className="aw-pricing-founder-label">Founding partner</span>
              <strong>Toronto United Flag Football</strong>
              <p>
                Full board, shareable player links, and trading cards — free for TUFF fans, always.
              </p>
            </div>
            <a
              className="aw-btn aw-btn-ghost aw-pricing-founder-link"
              href={LIVE_LEAGUE_URL}
              onClick={() => trackMarketingClick("pricing_tuff_demo")}
            >
              See TUFF live
            </a>
          </div>

          <div className="aw-pricing-grid">
            {PRICING.map((plan) => (
              <article
                key={plan.id}
                className={`aw-price-card${plan.featured ? " aw-price-card--featured" : ""}`}
              >
                {plan.featured ? <span className="aw-price-badge">Most popular</span> : null}
                <h3 className="aw-price-name">{plan.name}</h3>
                <p className="aw-price-amount">
                  <span>{plan.price}</span>
                  <small>{plan.period}</small>
                </p>
                <p className="aw-price-blurb">{plan.blurb}</p>
                <ul className="aw-price-features">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <a
                  className={`aw-btn ${plan.featured ? "aw-btn-primary" : "aw-btn-ghost"} aw-price-cta`}
                  href={pricingMail(plan.name)}
                  onClick={() => trackMarketingClick(`pricing_${plan.id}`)}
                >
                  {plan.cta}
                </a>
              </article>
            ))}
          </div>

          <p className="aw-pricing-note">
            One-time setup from $299 for SportsPress wiring, branding, and go-live. Founding leagues
            outside TUFF may qualify for a launch discount — ask when you book a demo.
          </p>
        </section>

        <section className="aw-mid-cta" aria-label="Book a demo">
          <div className="aw-mid-cta-inner">
            <h2 className="aw-section-title">See your league on Afterwhistle</h2>
            <p className="aw-section-lede">
              Send us a link to your standings page. We’ll show you what a board for your club can
              look like.
            </p>
            <div className="aw-cta">
              <a className="aw-btn aw-btn-primary" href={DEMO_HREF}
            onClick={() => trackMarketingClick("book_demo")}>
                Book a demo
              </a>
              <a className="aw-btn aw-btn-ghost" href={LIVE_LEAGUE_URL}
            onClick={() => trackMarketingClick("live_demo")}>
                See a live league
              </a>
            </div>
          </div>
        </section>

        <section className="aw-section aw-faq" id="faq" aria-labelledby="aw-faq-title">
          <div className="aw-faq-layout">
            <div className="aw-faq-intro">
              <h2 id="aw-faq-title" className="aw-section-title">
                FAQ
              </h2>
              <p className="aw-section-lede">Quick answers for directors and captains.</p>
            </div>
            <div className="aw-faq-list">
              {FAQS.map((item) => (
                <details
                  key={item.q}
                  className="aw-faq-item"
                  onToggle={(event) => {
                    if (event.currentTarget.open) {
                      trackEvent("marketing_faq_open", { question: item.q });
                    }
                  }}
                >
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="aw-section aw-close aw-split" aria-labelledby="aw-close-title">
          <div className="aw-split-copy aw-close-copy">
            <h2 id="aw-close-title" className="aw-brand aw-brand-sm">
              Afterwhistle
            </h2>
            <p className="aw-headline aw-headline-sm">
              When the whistle blows,
              <span className="aw-headline-break"> the board is already live.</span>
            </p>
            <div className="aw-cta">
              <a className="aw-btn aw-btn-primary" href={DEMO_HREF}
            onClick={() => trackMarketingClick("book_demo")}>
                Book a demo
              </a>
            </div>
          </div>
          <figure className="aw-shot aw-shot-close">
            <img
              src="/marketing/aw-close-whistle.png"
              alt="Whistle and scoreboard after the final play"
              width={1400}
              height={1050}
              loading="lazy"
            />
          </figure>
        </section>
      </main>

      <footer className="aw-foot">
        <span>Afterwhistle</span>
        <div className="aw-foot-links">
          <a href={LIVE_LEAGUE_URL}
            onClick={() => trackMarketingClick("live_demo")}>Live demo</a>
          <a href={`mailto:${DEMO_MAIL}`} onClick={() => trackMarketingClick("contact")}>Contact</a>
        </div>
      </footer>
    </div>
  );
}
