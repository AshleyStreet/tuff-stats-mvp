import { useEffect, useState, type FormEvent } from "react";
import { MarketingDemo } from "./MarketingDemo";
import { TradingCard } from "./TradingCard";
import "./marketing.css";
import { LeaguePreviewProvider } from "../league/LeagueProvider";
import { tuffPublicLeague } from "../league/tuff";
import { trackEvent, trackPageView } from "../lib/analytics";
import { setPageSeo } from "../lib/seo";
import { marketingSampleCard } from "../lib/marketingSampleCard";

const LIVE_LEAGUE_URL = "https://tuff.afterwhistle.ca";
const START_HREF = "#start";

/** Real leagues already on Afterwhistle — proof beats adjectives. */
const LIVE_LEAGUES = [
  { name: "TUFF", detail: "172 players · 7 seasons · flag football" },
  { name: "Passion Soccer", detail: "106 players · 9 divisions" },
  { name: "Bush League", detail: "47 games · softball" }
] as const;

/**
 * The pitch: your stats already exist somewhere, and we read them from there.
 * Each lane is a source we actually ingest today.
 */
const SOURCES = [
  {
    tag: "Spreadsheet",
    name: "Google Sheets",
    copy: "Publish the sheet you already keep. Add a season column and one file covers every year you've played."
  },
  {
    tag: "WordPress",
    name: "SportsPress",
    copy: "Standings, schedules and player lists straight from the plugin. Divisions and multi-season sites included."
  },
  {
    tag: "Legacy platform",
    name: "eSportsDesk",
    copy: "No API, no export, no problem. We read the pages your league has been posting for years."
  },
  {
    tag: "Anything else",
    name: "Your stats table",
    copy: "A stats page we can open is enough to start. Send us the link and we'll tell you what we can read."
  }
] as const;

const FAQS = [
  {
    q: "Do we have to replace our website?",
    a: "No. Keep it for registration, news and everything else. Afterwhistle is only the board people open after the whistle."
  },
  {
    q: "Our stats live in a spreadsheet. Is that a problem?",
    a: "It's the easiest case we handle. Publish the sheet, send us the link, and we read it directly — no re-typing, and no new admin work for whoever keeps it."
  },
  {
    q: "What if our league software has no export?",
    a: "Still fine. We read published pages directly, including older platforms that never had an API. If we can open it, we can usually read it."
  },
  {
    q: "Is there a free plan?",
    a: "No — but seeing your league on a real board is free. We build it from your existing stats and show you, and you decide from there. Every plan after that has a price, because every board comes with a person who set it up."
  },
  {
    q: "What happens in the off-season?",
    a: "On season billing, nothing. You pay once per season and the board stays up in between, so last season's standings and player cards keep working."
  },
  {
    q: "Which sports do you cover?",
    a: "Flag and touch football, softball and soccer today — each with the columns that sport actually cares about. New sports get added when a league needs one."
  },
  {
    q: "Will this change anything on our current site?",
    a: "No. We only read what you already publish. Nothing is edited, overwritten or moved."
  }
] as const;

type Billing = "season" | "month";

const PRICING = [
  {
    id: "league",
    name: "League",
    season: "$189",
    month: "$39",
    blurb: "A branded board fans will actually bookmark.",
    features: [
      "yourleague.afterwhistle.ca",
      "Your colours and club logo",
      "Full stats board + trading cards",
      "SEO and social link previews",
      "Email support"
    ],
    featured: true
  },
  {
    id: "club",
    name: "Club",
    season: "$479",
    month: "$99",
    blurb: "For clubs running more than one league, on their own domain.",
    features: [
      "Everything in League",
      "Custom domain (stats.yourclub.ca)",
      "White-label — no Afterwhistle badge",
      "Captain tools & bulk card print",
      "Priority onboarding"
    ],
    featured: false
  }
] as const;

/**
 * Every plan CTA goes to the form, not to checkout. The page's argument is that
 * we build your board on your own data first and setup is quoted up front —
 * self-serve checkout with no onboarding contradicts that, and would take money
 * before we know whether we can read the league's stats at all.
 */

function trackMarketingClick(target: string) {
  trackEvent("marketing_click", { target });
}

type FormState = "idle" | "sending" | "sent" | "error";

export function MarketingHome() {
  const sampleCard = marketingSampleCard();
  const [billing, setBilling] = useState<Billing>("season");
  const [formState, setFormState] = useState<FormState>("idle");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const title = "Afterwhistle · League stats boards";
    document.documentElement.classList.add("marketing");
    setPageSeo({
      title,
      description:
        "Your league's stats already exist — in a spreadsheet, a plugin, or an old league page. We read them from wherever they live and turn them into a fast, branded board.",
      siteName: "Afterwhistle"
    });
    trackPageView("/", title);
    return () => {
      document.documentElement.classList.remove("marketing");
    };
  }, []);

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFormState("sending");
    setFormError(null);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league: data.get("league"),
          sport: data.get("sport"),
          statsUrl: data.get("statsUrl"),
          email: data.get("email"),
          notes: data.get("notes"),
          website: data.get("website")
        })
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "That didn't send. Try again in a moment.");
      trackEvent("lead_submit", { sport: String(data.get("sport") ?? "") });
      setFormState("sent");
      form.reset();
    } catch (error) {
      setFormState("error");
      setFormError(error instanceof Error ? error.message : "That didn't send.");
    }
  }

  return (
    <div className="aw-shell">
      <header className="aw-top">
        <span className="aw-wordmark" aria-current="page">
          Afterwhistle
        </span>
        <nav className="aw-nav" aria-label="Primary">
          <a href="#sources" onClick={() => trackMarketingClick("nav_sources")}>Your data</a>
          <a href="#product" onClick={() => trackMarketingClick("nav_product")}>The board</a>
          <a href="#how" onClick={() => trackMarketingClick("nav_how")}>How it works</a>
          <a href="#pricing" onClick={() => trackMarketingClick("nav_pricing")}>Pricing</a>
          <a className="aw-nav-cta" href={START_HREF} onClick={() => trackMarketingClick("nav_start")}>
            Send your link
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
              Your stats already exist.
              <span className="aw-headline-break"> They're just somewhere nobody looks.</span>
            </h1>
            <p className="aw-lede aw-rise aw-rise-3">
              A spreadsheet the convenor updates on Sunday nights. A SportsPress plugin. A league
              page that hasn't been restyled since 2011. <strong>We read whichever one you already
              have</strong> and turn it into a board your players actually open.
            </p>
            <div className="aw-cta aw-rise aw-rise-4">
              <a className="aw-btn aw-btn-primary" href={START_HREF}
                onClick={() => trackMarketingClick("hero_start")}>
                Send us your stats link
              </a>
              <a className="aw-btn aw-btn-ghost" href={LIVE_LEAGUE_URL}
                onClick={() => trackMarketingClick("live_demo")}>
                See a live league
              </a>
            </div>

            {/* The thesis, drawn: three real sources resolving into one board row. */}
            <div className="aw-rig aw-rise aw-rise-4">
              <div className="aw-sources">
                <div className="aw-src aw-src--sheet">
                  <b>Google Sheet</b>
                  season,name,team,gp,td,c1,c2
                </div>
                <div className="aw-src aw-src--sp">
                  <b>SportsPress</b>
                  /wp-json/sportspress/v2/lists
                </div>
                <div className="aw-src aw-src--esd">
                  <b>eSportsDesk</b>
                  stats_football_flag.cfm?leagueID=…
                </div>
              </div>
              <div className="aw-rig-arrow" aria-hidden="true">→</div>
              <div className="aw-board-out">
                <div className="aw-board-who">
                  <span className="aw-board-name">Mike Jutzi</span>
                  <span className="aw-board-team">Barbarian Jackets</span>
                </div>
                <div className="aw-statline">
                  <div className="aw-stat"><span className="aw-stat-k">GP</span><span className="aw-stat-v">4</span></div>
                  <div className="aw-stat aw-stat--hot"><span className="aw-stat-k">TD</span><span className="aw-stat-v">4</span></div>
                  <div className="aw-stat"><span className="aw-stat-k">C1</span><span className="aw-stat-v">0</span></div>
                  <div className="aw-stat"><span className="aw-stat-k">C2</span><span className="aw-stat-v">0</span></div>
                  <div className="aw-stat aw-stat--hot"><span className="aw-stat-k">PTS</span><span className="aw-stat-v">24</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="aw-proof" aria-label="Leagues already live">
          <p className="aw-proof-label">Live now</p>
          <ul className="aw-proof-list">
            {LIVE_LEAGUES.map((league) => (
              <li key={league.name}>
                <strong>{league.name}</strong>
                <span>{league.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="aw-section" id="sources" aria-labelledby="aw-sources-title">
          <div className="aw-product-head">
            <h2 id="aw-sources-title" className="aw-section-title">
              We meet your data where it is
            </h2>
            <p className="aw-section-lede">
              Most league software asks you to move everything over first. We don't. If your
              numbers are published somewhere — anywhere — that's the integration.
            </p>
          </div>
          <div className="aw-lanes">
            {SOURCES.map((source) => (
              <div className="aw-lane" key={source.name}>
                <span className="aw-lane-tag">{source.tag}</span>
                <h3>{source.name}</h3>
                <p>{source.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="aw-section aw-product" id="product" aria-labelledby="aw-product-title">
          <div className="aw-product-head">
            <h2 id="aw-product-title" className="aw-section-title">
              Same numbers. Better board.
            </h2>
            <p className="aw-section-lede">
              Sorted, searchable and fast on a phone in a parking lot. This one is live — search
              it, sort it, open a player. It's the same board running at{" "}
              <a href={LIVE_LEAGUE_URL} onClick={() => trackMarketingClick("live_demo")}>
                tuff.afterwhistle.ca
              </a>.
            </p>
          </div>
          <MarketingDemo />
          <p className="aw-demo-caption">
            Harbor Flag Football is a sample league. Your board shows your teams, your players and
            your colours.
          </p>
        </section>

        <section className="aw-section aw-cards-media aw-split aw-split--flip" aria-labelledby="aw-cards-title">
          <div className="aw-split-copy aw-cards-copy">
            <h2 id="aw-cards-title" className="aw-section-title">
              Cards players actually share
            </h2>
            <p className="aw-section-lede">
              A season on one card you can print or send — not another spreadsheet screenshot.
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
              Live in days, not seasons
            </h2>
            <p className="aw-section-lede">Three steps. Your website stays where it is.</p>
          </div>
          <ol className="aw-steps aw-steps-row">
            <li>
              <span className="aw-step-num">01</span>
              <div>
                <strong>Send us a link</strong>
                <p>Your stats page, your sheet, your plugin. We'll tell you what we can read from it — usually the same day.</p>
              </div>
            </li>
            <li>
              <span className="aw-step-num">02</span>
              <div>
                <strong>We make it yours</strong>
                <p>Your club colours, your crest, your subdomain. Multiple leagues each get their own identity.</p>
              </div>
            </li>
            <li>
              <span className="aw-step-num">03</span>
              <div>
                <strong>Share the link</strong>
                <p>That's the whole migration. Registration, news and your site stay exactly where they are.</p>
              </div>
            </li>
          </ol>
        </section>

        <section className="aw-section aw-pricing" id="pricing" aria-labelledby="aw-pricing-title">
          <div className="aw-pricing-head">
            <h2 id="aw-pricing-title" className="aw-section-title">
              See it on your data first. Then pick a plan.
            </h2>
            <p className="aw-section-lede">
              Send us the link to wherever your stats live and we'll build your board and show you —
              no charge, no commitment. If you like it, it goes live on one of these.
            </p>
            <div className="aw-billing" role="group" aria-label="Billing period">
              <button
                type="button"
                aria-pressed={billing === "season"}
                onClick={() => { setBilling("season"); trackMarketingClick("billing_season"); }}
              >
                Per season
              </button>
              <button
                type="button"
                aria-pressed={billing === "month"}
                onClick={() => { setBilling("month"); trackMarketingClick("billing_month"); }}
              >
                Monthly
              </button>
            </div>
            <p className="aw-billing-note">
              {billing === "season"
                ? "Built for how leagues budget — one charge per season, out of registration fees. Nothing to pay in the off-season."
                : "Year-round billing — for clubs running back-to-back seasons with no real off-season."}
            </p>
          </div>

          <div className="aw-pricing-grid">
            {PRICING.map((plan) => (
              <article
                key={plan.id}
                className={`aw-price-card${plan.featured ? " aw-price-card--featured" : ""}`}
              >
                {plan.featured ? <span className="aw-price-badge">Most leagues pick this</span> : null}
                <h3 className="aw-price-name">{plan.name}</h3>
                <p className="aw-price-amount">
                  {billing === "season" ? plan.season : plan.month}
                  <span>{billing === "season" ? " / season" : " / month"}</span>
                </p>
                <p className="aw-price-blurb">{plan.blurb}</p>
                <ul className="aw-price-features">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <a
                  className={`aw-btn aw-price-cta ${plan.featured ? "aw-btn-primary" : "aw-btn-ghost"}`}
                  href={START_HREF}
                  onClick={() => trackMarketingClick(`plan_${plan.id}`)}
                >
                  Get {plan.name}
                </a>
              </article>
            ))}

            <article className="aw-price-card">
              <h3 className="aw-price-name">Setup</h3>
              <p className="aw-price-amount">
                $299<span> once</span>
              </p>
              <p className="aw-price-blurb">
                Getting your league's data flowing, once. Charged up front, never monthly.
              </p>
              <ul className="aw-price-features">
                <li>We connect your existing source</li>
                <li>Every past season we can reach, loaded</li>
                <li>Branding and domain configured</li>
                <li>Same price whatever you run on</li>
                <li>Waived for founding leagues</li>
              </ul>
              <a className="aw-btn aw-btn-ghost aw-price-cta" href={START_HREF}
                onClick={() => trackMarketingClick("plan_setup")}>
                Get started
              </a>
            </article>
          </div>
        </section>

        <section className="aw-section aw-faq" id="faq" aria-labelledby="aw-faq-title">
          <div className="aw-faq-layout">
            <div className="aw-faq-intro">
              <h2 id="aw-faq-title" className="aw-section-title">
                The honest answers
              </h2>
              <p className="aw-section-lede">Questions convenors actually ask.</p>
            </div>
            <div className="aw-faq-list">
              {FAQS.map((faq) => (
                <details className="aw-faq-item" key={faq.q}>
                  <summary>{faq.q}</summary>
                  <p>{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="aw-section aw-close" id="start" aria-labelledby="aw-close-title">
          <div className="aw-start-grid">
            <div>
              <p className="aw-brand aw-brand-sm">After the whistle</p>
              <h2 id="aw-close-title" className="aw-section-title">
                Send a link. Get a board.
              </h2>
              <p className="aw-section-lede">
                Tell us where your stats live today and we'll build your league's board on your
                real data — teams, players, past seasons — and send it back to look at.
              </p>
              <ul className="aw-assure">
                <li>No charge and no commitment for the first board.</li>
                <li>We only read what you already publish. Nothing on your site changes.</li>
                <li>Usually back to you within a couple of days.</li>
                <li>No link handy? Send the form anyway and we'll work it out.</li>
              </ul>
            </div>

            {formState === "sent" ? (
              <div className="aw-start-done" role="status">
                <h3>Got it — thanks.</h3>
                <p>
                  We'll take a look at your stats and come back with a board, usually within a
                  couple of days. If we have questions we'll just reply to your email.
                </p>
                <a className="aw-btn aw-btn-ghost" href={LIVE_LEAGUE_URL}
                  onClick={() => trackMarketingClick("live_demo_after_submit")}>
                  See a live league meanwhile
                </a>
              </div>
            ) : (
              <form className="aw-start" onSubmit={submitLead}>
                <div className="aw-field-row">
                  <label className="aw-field">
                    <span>League or club</span>
                    <input name="league" type="text" placeholder="Central Toronto Touch Football" required />
                  </label>
                  <label className="aw-field">
                    <span>Sport</span>
                    <select name="sport" defaultValue="Flag football">
                      <option>Flag football</option>
                      <option>Touch football</option>
                      <option>Softball</option>
                      <option>Soccer</option>
                      <option>Something else</option>
                    </select>
                  </label>
                </div>

                <label className="aw-field">
                  <span>
                    Where your stats live today
                    <em> — a sheet, a stats page, your league platform</em>
                  </span>
                  <input name="statsUrl" type="url" inputMode="url" placeholder="https://…" />
                </label>

                <label className="aw-field">
                  <span>Your email</span>
                  <input name="email" type="email" placeholder="you@yourleague.ca" required />
                </label>

                <label className="aw-field">
                  <span>Anything we should know<em> — optional</em></span>
                  <textarea name="notes" rows={2} placeholder="Two divisions, and we've got 2019 onward in an old spreadsheet." />
                </label>

                {/* Honeypot: bots fill this, people never see it. */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="aw-hp"
                />

                <button className="aw-btn aw-btn-primary" type="submit" disabled={formState === "sending"}>
                  {formState === "sending" ? "Sending…" : "Build my board"}
                </button>
                {formError ? <p className="aw-form-error">{formError}</p> : null}
                <p className="aw-form-foot">
                  We'll only use this to reply about your league. No list, no newsletter.
                </p>
              </form>
            )}
          </div>
        </section>
      </main>

      <footer className="aw-foot">
        <span>Afterwhistle — league stats boards</span>
        <span className="aw-foot-links">
          <a href="mailto:info@afterwhistle.ca">info@afterwhistle.ca</a>
        </span>
      </footer>
    </div>
  );
}
