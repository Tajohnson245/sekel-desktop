import './Blueprints.css';

const blueprints = [
  { org: 'USMLE · FSMB & NBME', name: 'Step 1', tag: '18 Systems' },
  { org: 'USMLE · FSMB & NBME', name: 'Step 2 CK', tag: 'Clinical Knowledge' },
  { org: 'USMLE · FSMB & NBME', name: 'Step 3', tag: 'Patient Management' },
  { org: 'NBME · Subject Exams', name: 'IM Shelf', tag: 'Internal Medicine' },
  { org: 'NBME · Subject Exams', name: 'All 10 Shelf Exams', tag: 'All Rotations' },
  { org: 'NCSBN', name: 'NCLEX-RN', tag: '2026 Test Plan' },
];

export default function Blueprints() {
  return (
    <section id="blueprints" className="blueprints-section">
      <div className="container">
        <span className="section-label">Supported Exams</span>

        <h2 className="blueprints-headline reveal">Built on official blueprints.</h2>

        <p className="blueprints-subheadline reveal reveal-delay-1">
          Sekel ingests content outlines directly from the governing bodies that publish them — not
          third-party summaries or scraped data. When they update, Sekel updates.
        </p>

        <div className="blueprints-grid">
          {blueprints.map((bp, i) => (
            <div key={i} className={`blueprint-card reveal reveal-delay-${(i % 3) + 1}`}>
              <span className="bp-org">{bp.org}</span>
              <h3 className="bp-name">{bp.name}</h3>
              <span className="bp-tag">{bp.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
