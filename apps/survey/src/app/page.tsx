import "./page.css";

export default function HomePage() {
  return (
    <div className="home">
      <div className="home__hero">
        <div className="home__hero-inner">
          <span className="home__eyebrow">Beta Research · 3–5 minutes</span>
          <h1 className="home__title">Help us build the study tool you actually want</h1>
          <p className="home__subtitle">
            SEKEL is an AI-powered spaced repetition app built for medical students.
            We&apos;re collecting feedback before launch — tell us how you study and what
            drives you crazy, and we&apos;ll use it to build something better.
          </p>
          <a href="/survey" className="home__cta">
            Start the Survey →
          </a>
          <p className="home__cta-note">No account needed · Takes 3–5 minutes</p>
        </div>
      </div>

      <div className="home__features">
        <div className="home__feature-grid">
          <div className="home__feature-card">
            <span className="home__feature-icon">🎯</span>
            <h3>High-Yield Focus</h3>
            <p>We&apos;re building for USMLE, NBME Shelf, and NCLEX — not general audiences.</p>
          </div>
          <div className="home__feature-card">
            <span className="home__feature-icon">🤖</span>
            <h3>AI-Powered</h3>
            <p>Smart card generation, adaptive scheduling, and intelligent review sessions.</p>
          </div>
          <div className="home__feature-card">
            <span className="home__feature-icon">📊</span>
            <h3>Built on FSRS</h3>
            <p>The most accurate open-source spaced repetition algorithm — not Anki&apos;s aging SM-2.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
