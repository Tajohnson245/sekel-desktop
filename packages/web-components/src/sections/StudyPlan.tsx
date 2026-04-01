import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import './StudyPlan.css';

const rampRows = [
  { week: 'Week 1', cards: 80, pct: 32 },
  { week: 'Week 2', cards: 100, pct: 40 },
  { week: 'Week 4', cards: 140, pct: 56 },
  { week: 'Week 6', cards: 165, pct: 66 },
  { week: 'Exam wk', cards: 200, pct: 80 },
];

const coverage = [
  { system: 'Cardiovascular', weight: 30, covered: 72, ok: true },
  { system: 'Renal / Urology', weight: 20, covered: 68, ok: true },
  { system: 'Immunology', weight: 10, covered: 31, ok: false },
  { system: 'Endocrine', weight: 12, covered: 44, ok: false },
];

export default function StudyPlan() {
  return (
    <section id="study-plan" className="studyplan-section">
      <div className="container studyplan-inner">
        {/* Left: copy + ramp */}
        <div className="studyplan-left">
          <span className="section-label">Study Plan</span>
          <h2 className="studyplan-headline reveal">
            Sekel tells you exactly<br />
            <em>how many cards to study each day.</em>
          </h2>
          <p className="studyplan-body reveal reveal-delay-1">
            Enter your exam date. Sekel calculates a daily card target that scales with your review
            load as the exam approaches. No guessing, no spreadsheets — just a plan.
          </p>

          <div className="ramp-table reveal reveal-delay-2">
            <div className="ramp-header">
              <span>Week</span>
              <span>Daily target</span>
            </div>
            {rampRows.map((row, i) => (
              <div key={i} className={`ramp-row${row.week === 'Exam wk' ? ' ramp-row-max' : ''}`}>
                <span className="ramp-week">{row.week}</span>
                <div className="ramp-bar-wrap">
                  <div className="ramp-bar" style={{ width: `${row.pct}%` }}></div>
                </div>
                <span className="ramp-cards">{row.cards} cards/day</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: coverage table */}
        <div className="studyplan-right reveal reveal-delay-1">
          <div className="coverage-card">
            <div className="coverage-header">
              <span className="coverage-title">System Coverage — USMLE Step 1</span>
              <span className="coverage-sub">Blueprint weight vs. cards in deck</span>
            </div>

            <div className="coverage-rows">
              {coverage.map((row, i) => (
                <div key={i} className="coverage-row">
                  <div className="coverage-system">
                    <span className="coverage-name">{row.system}</span>
                    <span className="coverage-weight">{row.weight}% blueprint</span>
                  </div>
                  <div className="coverage-bar-wrap">
                    <div
                      className={`coverage-bar ${row.ok ? 'cov-bar-ok' : 'cov-bar-gap'}`}
                      style={{ width: `${row.covered}%` }}
                    ></div>
                  </div>
                  <div className="coverage-status">
                    <span className={`coverage-pct ${row.ok ? 'pct-ok' : 'pct-gap'}`}>
                      {row.covered}%
                    </span>
                    {row.ok
                      ? <CheckCircle2 size={13} className="status-icon icon-ok" />
                      : <AlertTriangle size={13} className="status-icon icon-gap" />}
                  </div>
                </div>
              ))}
            </div>

            <p className="coverage-footer">
              Coverage gaps show exactly where to add more cards before exam day.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
