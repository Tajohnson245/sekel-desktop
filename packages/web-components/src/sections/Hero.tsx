import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import './Hero.css';

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-orb orb-1" aria-hidden="true"></div>
      <div className="hero-orb orb-2" aria-hidden="true"></div>
      <div className="hero-orb orb-3" aria-hidden="true"></div>

      <div className="container hero-container">
        {/* Left: copy */}
        <div className="hero-left">
          <div className="hero-badge reveal">
            <span className="badge-dot" aria-hidden="true"></span>
            Now in development — Join the waitlist
          </div>

          <h1 className="hero-title reveal reveal-delay-1">
            Study what <em>actually matters</em> for your next exam.
          </h1>

          <p className="hero-subtitle reveal reveal-delay-2">
            SEKEL combines spaced repetition with <strong>official exam blueprints</strong> and your personal
            performance data to tell you exactly which cards are worth your limited time — and which aren&apos;t.
          </p>

          <div className="hero-actions reveal reveal-delay-3">
            <Link href="#waitlist" className="hero-btn-primary">
              Join the Waitlist <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="#how-it-works" className="hero-btn-secondary">
              See how it works
            </Link>
          </div>

          <div className="hero-stats reveal">
            <div className="stat">
              <span className="stat-number">7</span>
              <span className="stat-label">EXAM TYPES SUPPORTED</span>
            </div>
            <div className="stat">
              <span className="stat-number">FSRS</span>
              <span className="stat-label">ALGORITHM</span>
            </div>
          </div>
        </div>

        {/* Right: app mockup */}
        <div className="hero-right">
          <div className="mockup-container reveal">
            <div className="mockup-topbar">
              <div className="mockup-dots">
                <span className="dot dot-red"></span>
                <span className="dot dot-yellow"></span>
                <span className="dot dot-green"></span>
              </div>
              <span className="mockup-title-text">SEKEL — Internal Medicine Shelf · 14 days remaining</span>
            </div>

            <div className="mockup-body">
              {/* AI Panel */}
              <div className="ai-panel">
                <div className="ai-header">
                  <div className="ai-icon-box"><Sparkles size={14} /></div>
                  <span className="ai-label">SEKEL Intelligence</span>
                </div>
                <p className="ai-body">
                  Your IM shelf is in <strong>14 days</strong>. You&apos;re struggling with{' '}
                  <strong>Cardiology</strong> (62% accuracy) — weighted <strong>15–20%</strong> on the
                  blueprint. These 38 cards are your highest-leverage study right now.
                </p>
                <div className="ai-chips">
                  <span className="chip chip-teal">38 cards prioritized</span>
                  <span className="chip chip-teal">~55 min</span>
                  <span className="chip chip-dim">212 deprioritized</span>
                  <span className="chip chip-dim">Low yield today</span>
                </div>
                <div className="progress-section">
                  <div className="progress-row">
                    <div className="progress-label-row">
                      <span className="progress-name">Cardiology</span>
                      <span className="progress-pct pct-teal">62%</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill fill-teal" style={{ width: '62%' }}></div>
                    </div>
                    <span className="progress-sub">Blueprint: 15–20% · 48 cards due</span>
                  </div>
                  <div className="progress-row">
                    <div className="progress-label-row">
                      <span className="progress-name">Nephrology</span>
                      <span className="progress-pct pct-rose">58%</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill fill-rose" style={{ width: '58%' }}></div>
                    </div>
                    <span className="progress-sub">Blueprint: 10–15% · 31 cards due</span>
                  </div>
                </div>
              </div>

              {/* Flashcard */}
              <div className="flashcard">
                <div className="card-yield-badge">
                  <span className="yield-dot"></span>
                  IM Shelf · Cardiology · High Yield
                </div>
                <p className="card-question">
                  A 58-year-old man presents with chest pain, diaphoresis, and ST elevation in leads II,
                  III, aVF. Most likely diagnosis?
                </p>
                <hr className="card-divider" />
                <p className="card-answer">
                  <strong>Inferior STEMI</strong> — RCA occlusion. Check right-sided leads (V4R) for RV
                  infarct. Avoid nitrates if RV involvement suspected.
                </p>
                <div className="rating-grid">
                  <button className="rating-btn btn-again">
                    <span>Again</span>
                    <span className="interval">&lt;1m</span>
                  </button>
                  <button className="rating-btn btn-hard">
                    <span>Hard</span>
                    <span className="interval">4d</span>
                  </button>
                  <button className="rating-btn btn-good">
                    <span>Good</span>
                    <span className="interval">8d</span>
                  </button>
                  <button className="rating-btn btn-easy">
                    <span>Easy</span>
                    <span className="interval">21d</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
