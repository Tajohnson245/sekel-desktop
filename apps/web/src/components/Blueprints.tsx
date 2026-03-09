import './Blueprints.css';

const blueprints = [
  {
    org: 'USMLE · FSMB & NBME',
    name: 'Step 1',
    description: 'Foundational sciences across 18 organ systems. Pass/fail but foundational for Steps 2 & 3.',
    tags: ['18 Systems', 'Updated 2024'],
  },
  {
    org: 'USMLE · FSMB & NBME',
    name: 'Step 2 CK',
    description: 'Clinical knowledge across all major specialties. Scored exam. Critical for residency applications.',
    tags: ['8 Disciplines', 'Scored'],
  },
  {
    org: 'USMLE · FSMB & NBME',
    name: 'Step 3',
    description: 'Clinical medicine and patient management. Required for full medical licensure in the US.',
    tags: ['CCS Cases', 'Licensure'],
  },
  {
    org: 'NBME · Subject Exams',
    name: 'IM Shelf',
    description: 'Internal Medicine clerkship exam. Cardiology, Nephrology, GI, Pulm, and more — all weighted.',
    tags: ['End of Clerkship', 'Graded'],
  },
  {
    org: 'NBME · Subject Exams',
    name: 'All 10 Shelf Exams',
    description: 'Surgery, Pediatrics, OB/GYN, Psychiatry, Neurology, Family Medicine, and more.',
    tags: ['10 Exams', 'All Rotations'],
  },
  {
    org: 'NCSBN',
    name: 'NCLEX-RN',
    description: 'Nursing licensure exam. 2026 test plan with updated clinical judgment framework and CAT format.',
    tags: ['2026 Plan', 'CAT Format'],
  },
];

export default function Blueprints() {
  return (
    <section id="blueprints" className="blueprints-section">
      <div className="container">
        <span className="section-label">Supported Exams</span>

        <h2 className="blueprints-headline reveal">Built on official blueprints.</h2>

        <p className="blueprints-subheadline reveal reveal-delay-1">
          SEKEL ingests content outlines directly from the governing bodies that publish them — not
          third-party summaries or scraped data. When they update, SEKEL updates.
        </p>

        <div className="blueprints-grid">
          {blueprints.map((bp, i) => (
            <div key={i} className={`blueprint-card reveal reveal-delay-${(i % 3) + 1}`}>
              <span className="bp-org">{bp.org}</span>
              <h3 className="bp-name">{bp.name}</h3>
              <p className="bp-description">{bp.description}</p>
              <div className="bp-tags">
                {bp.tags.map((tag, j) => (
                  <span key={j} className="bp-tag">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
