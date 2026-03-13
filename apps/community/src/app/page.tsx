import Link from "next/link";
import { ScrollReveal } from "@sekel/web-components";
import { DeckCard, computeStats, formatNumber } from "@sekel/community-components";
import type { DeckCategory } from "@sekel/community-components";
import { mockDecks } from "@/lib/mock-data";
import HeroSearch from "./HeroSearch";
import "./home.css";

const CATEGORY_ICONS: Record<DeckCategory, string> = {
  Languages: "🌍",
  Medicine: "🩺",
  Science: "⚗️",
  Mathematics: "📐",
  History: "🏛️",
  Geography: "🗺️",
  "Computer Science": "💻",
  Music: "🎵",
  Art: "🎨",
  Law: "⚖️",
  Business: "📊",
  Other: "📚",
};

const CATEGORIES = Object.keys(CATEGORY_ICONS) as DeckCategory[];

export default function HomePage() {
  const stats = computeStats(mockDecks);
  const featuredDecks = mockDecks.filter((d) => d.featured).slice(0, 6);
  const recentDecks = [...mockDecks]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  return (
    <>
      {/* Hero */}
      <section className="home-hero">
        <div className="home-hero__glow" aria-hidden="true" />
        <div className="container home-hero__inner">
          <span className="home-hero__eyebrow section-label">— SEKEL Community —</span>
          <h1 className="home-hero__heading">
            Discover <em>Community</em> Decks
          </h1>
          <p className="home-hero__sub">
            Browse thousands of community-created flashcard decks for every subject.
            Free to use, always growing.
          </p>
          <div className="home-hero__search">
            <HeroSearch />
          </div>
          <div className="home-hero__links">
            <Link href="/decks" className="home-hero__cta">
              Browse All Decks
            </Link>
            <Link href="/add" className="home-hero__secondary">
              Add Your Deck
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <div className="home-stats">
        <div className="container home-stats__inner">
          <div className="home-stats__item">
            <span className="home-stats__value">{formatNumber(stats.totalDecks)}</span>
            <span className="home-stats__label">Decks</span>
          </div>
          <div className="home-stats__divider" aria-hidden="true" />
          <div className="home-stats__item">
            <span className="home-stats__value">{formatNumber(stats.totalCards)}</span>
            <span className="home-stats__label">Total Cards</span>
          </div>
          <div className="home-stats__divider" aria-hidden="true" />
          <div className="home-stats__item">
            <span className="home-stats__value">{formatNumber(stats.totalDownloads)}</span>
            <span className="home-stats__label">Downloads</span>
          </div>
        </div>
      </div>

      {/* Featured decks */}
      <section className="home-section">
        <div className="container">
          <ScrollReveal>
            <span className="section-label">— Featured Decks —</span>
            <h2 className="home-section__heading">Top picks from the community</h2>
            <div className="home-grid home-grid--featured">
              {featuredDecks.map((deck) => (
                <DeckCard key={deck.id} deck={deck} />
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Categories */}
      <section className="home-section home-section--alt">
        <div className="container">
          <ScrollReveal delay={0.1}>
            <span className="section-label">— Browse by Category —</span>
            <h2 className="home-section__heading">Find what you&apos;re studying</h2>
            <div className="home-categories">
              {CATEGORIES.map((cat) => (
                <Link
                  key={cat}
                  href={`/decks?category=${encodeURIComponent(cat)}`}
                  className="home-category-pill"
                >
                  <span className="home-category-pill__icon" aria-hidden="true">
                    {CATEGORY_ICONS[cat]}
                  </span>
                  {cat}
                </Link>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Recently added */}
      <section className="home-section">
        <div className="container">
          <ScrollReveal delay={0.05}>
            <span className="section-label">— Recently Added —</span>
            <h2 className="home-section__heading">Fresh from the community</h2>
            <div className="home-grid">
              {recentDecks.map((deck) => (
                <DeckCard key={deck.id} deck={deck} />
              ))}
            </div>
            <div className="home-browse-cta">
              <Link href="/decks" className="home-browse-link">
                View all {mockDecks.length} decks →
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
