import { Info } from 'lucide-react';
import './YieldSystem.css';

export default function YieldSystem() {
  return (
    <section id="yield" className="yield-section">
      <div className="container yield-inner">
        {/* Left: Text */}
        <div className="yield-text">
          <span className="section-label">The Yield System</span>
          <h2 className="yield-headline reveal">
            The same card.<br />
            Different exams.<br />
            <em>Different priority.</em>
          </h2>
          <p className="yield-body reveal reveal-delay-1">
            A Cardiology card tagged as high-yield for your IM shelf might be medium-yield for Step 2 CK
            and low-yield for Step 1. SEKEL adjusts yield dynamically based on which exam you&apos;ve
            registered and the official blueprint for that exam.
          </p>
          <p className="yield-body-secondary reveal reveal-delay-2">
            Blueprint data is stored as versioned, updatable config — so when USMLE or NBME revises their
            content outlines, SEKEL updates without a code change.
          </p>
        </div>

        {/* Right: Visual demo */}
        <div className="yield-demo reveal reveal-delay-1">
          <span className="yield-demo-label">Inferior STEMI — same card, three exams</span>

          <div className="yield-cards">
            <div className="yield-card">
              <div className="yield-card-left">
                <span className="yield-card-title">Inferior STEMI (RCA Occlusion)</span>
                <span className="yield-card-sub">USMLE · Step 2 CK</span>
              </div>
              <span className="yield-pill pill-high">
                <span className="pill-dot dot-teal"></span>High Yield
              </span>
            </div>

            <div className="yield-card">
              <div className="yield-card-left">
                <span className="yield-card-title">Inferior STEMI (RCA Occlusion)</span>
                <span className="yield-card-sub">NBME · Internal Medicine Shelf</span>
              </div>
              <span className="yield-pill pill-high">
                <span className="pill-dot dot-teal"></span>High Yield
              </span>
            </div>

            <div className="yield-card">
              <div className="yield-card-left">
                <span className="yield-card-title">Inferior STEMI (RCA Occlusion)</span>
                <span className="yield-card-sub">USMLE · Step 1</span>
              </div>
              <span className="yield-pill pill-medium">
                <span className="pill-dot dot-amber"></span>Medium Yield
              </span>
            </div>
          </div>

          <div className="yield-note">
            <Info className="yield-note-icon" size={14} />
            <p>
              Yield is calculated from <strong>official exam blueprints</strong> — real topic weightings
              published by USMLE, NBME, and NCSBN. Not guesses.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
