import type { Deck } from "@sekel/community-components";

export const mockDecks: Deck[] = [
  // ── LANGUAGES ──
  {
    id: "lang-001",
    title: "Spanish 5000 Most Common Words",
    description:
      "Master the 5000 most frequently used Spanish words ranked by corpus frequency. Includes example sentences, IPA pronunciation, and part-of-speech tagging for every entry.",
    author: "linguaforge",
    category: "Languages",
    tags: ["spanish", "vocabulary", "beginner", "intermediate"],
    cardCount: 5000,
    downloadCount: 42300,
    rating: 4.8,
    ratingCount: 1240,
    featured: true,
    createdAt: "2024-09-15T00:00:00Z",
    updatedAt: "2025-01-20T00:00:00Z",
    sampleCards: [
      { front: "ser", back: "to be (permanent/identity) — Yo soy médico." },
      { front: "tener", back: "to have — Tengo hambre." },
      { front: "hacer", back: "to do / to make — ¿Qué haces?" },
      { front: "poder", back: "to be able to / can — No puedo dormir." },
    ],
  },
  {
    id: "lang-002",
    title: "Japanese Kanji N5–N3",
    description:
      "Covers all 500 kanji required for JLPT N5 through N3 certification. Each card includes readings (on'yomi and kun'yomi), stroke order notes, and example vocabulary.",
    author: "nihongo_lab",
    category: "Languages",
    tags: ["japanese", "kanji", "jlpt", "n5", "n3"],
    cardCount: 1200,
    downloadCount: 28900,
    rating: 4.7,
    ratingCount: 876,
    featured: true,
    createdAt: "2024-08-01T00:00:00Z",
    updatedAt: "2025-02-10T00:00:00Z",
    sampleCards: [
      { front: "日", back: "ひ / にち — sun, day. 日曜日 (Sunday), 毎日 (every day)" },
      { front: "月", back: "つき / げつ — moon, month. 月曜日 (Monday), 今月 (this month)" },
      { front: "山", back: "やま / さん — mountain. 富士山 (Mt. Fuji), 山田 (surname)" },
    ],
  },
  {
    id: "lang-003",
    title: "French B2 Grammar Essentials",
    description:
      "Targets upper-intermediate French learners preparing for DELF B2. Covers subjunctive triggers, conditional perfect, passive voice, and advanced connectors.",
    author: "paris_pedagogy",
    category: "Languages",
    tags: ["french", "grammar", "b2", "delf"],
    cardCount: 450,
    downloadCount: 9800,
    rating: 4.5,
    ratingCount: 312,
    createdAt: "2024-11-20T00:00:00Z",
    updatedAt: "2025-01-05T00:00:00Z",
    sampleCards: [
      { front: "Il faut que + ___", back: "Subjunctive — Il faut que tu viennes." },
      { front: "Si j'avais su, j'___ venu.", back: "aurais — Conditional perfect (past unreal)" },
    ],
  },
  {
    id: "lang-004",
    title: "Mandarin HSK 4 Vocabulary",
    description:
      "Complete vocabulary list for HSK Level 4 (1200 words). Each card shows simplified Chinese, pinyin, English definition, and a contextual example sentence.",
    author: "hanyu_hub",
    category: "Languages",
    tags: ["mandarin", "chinese", "hsk", "hsk4", "vocabulary"],
    cardCount: 1200,
    downloadCount: 15600,
    rating: 4.6,
    ratingCount: 521,
    createdAt: "2025-01-08T00:00:00Z",
    updatedAt: "2025-02-28T00:00:00Z",
    sampleCards: [
      { front: "了解 (liǎojiě)", back: "to understand / to know — 我了解你的意思。(I understand your meaning.)" },
      { front: "影响 (yǐngxiǎng)", back: "influence / to affect — 天气影响心情。(Weather affects mood.)" },
    ],
  },

  // ── MEDICINE ──
  {
    id: "med-001",
    title: "USMLE Step 1 Pathology",
    description:
      "High-yield pathology cards for USMLE Step 1 covering all organ systems. Based on Robbins & Cotran with Goljan lecture integration. Includes clinical vignettes.",
    author: "dr_cardio",
    category: "Medicine",
    tags: ["usmle", "step1", "pathology", "medical"],
    cardCount: 2800,
    downloadCount: 67400,
    rating: 4.9,
    ratingCount: 2341,
    featured: true,
    createdAt: "2024-06-01T00:00:00Z",
    updatedAt: "2025-03-01T00:00:00Z",
    sampleCards: [
      { front: "Most common cause of death in SLE?", back: "Lupus nephritis (WHO Class IV diffuse proliferative GN) → end-stage renal disease" },
      { front: "Reed-Sternberg cell immunohistochemistry", back: "CD15+, CD30+, CD45−. Owl-eye nuclei. Classic Hodgkin lymphoma." },
      { front: "Charcot's triad", back: "RUQ pain + fever + jaundice → ascending cholangitis (add hypotension + AMS = Reynolds' pentad)" },
    ],
  },
  {
    id: "med-002",
    title: "Pharmacology High-Yield Step 1",
    description:
      "Covers mechanism, clinical use, and toxicity of all major drug classes tested on USMLE Step 1. Organized by organ system with First Aid cross-references.",
    author: "pharmD_prep",
    category: "Medicine",
    tags: ["pharmacology", "usmle", "step1", "drugs"],
    cardCount: 1800,
    downloadCount: 51200,
    rating: 4.8,
    ratingCount: 1876,
    featured: true,
    createdAt: "2024-07-15T00:00:00Z",
    updatedAt: "2025-02-14T00:00:00Z",
    sampleCards: [
      { front: "Mechanism of ACE inhibitors", back: "Block ACE → ↓ angiotensin II → ↓ aldosterone → vasodilation + natriuresis. Side effects: cough (↑ bradykinin), angioedema." },
      { front: "Metformin mechanism", back: "Activates AMPK → ↓ hepatic gluconeogenesis. Does NOT cause hypoglycemia. Lactic acidosis risk (hold before contrast/surgery)." },
    ],
  },
  {
    id: "med-003",
    title: "Internal Medicine Shelf Prep",
    description:
      "Comprehensive shelf exam preparation covering inpatient medicine: heart failure, COPD exacerbations, AKI, sepsis, and common inpatient emergencies.",
    author: "shelf_warrior",
    category: "Medicine",
    tags: ["internal-medicine", "shelf", "clerkship"],
    cardCount: 3200,
    downloadCount: 29800,
    rating: 4.7,
    ratingCount: 987,
    createdAt: "2024-10-01T00:00:00Z",
    updatedAt: "2025-01-30T00:00:00Z",
    sampleCards: [
      { front: "CURB-65 score components", back: "Confusion, Urea >7, RR ≥30, BP <90/60, Age ≥65. Score ≥2 → consider admission." },
      { front: "Berlin criteria for ARDS", back: "PaO2/FiO2 <300, bilateral infiltrates, not explained by cardiac failure, acute onset (<1 week)" },
    ],
  },

  // ── SCIENCE ──
  {
    id: "sci-001",
    title: "AP Chemistry Full Course",
    description:
      "Complete AP Chemistry deck covering all 9 units: atomic structure, intermolecular forces, kinetics, equilibrium, thermodynamics, electrochemistry, and more.",
    author: "chem_teacher_pro",
    category: "Science",
    tags: ["chemistry", "ap", "college-board", "high-school"],
    cardCount: 800,
    downloadCount: 18400,
    rating: 4.6,
    ratingCount: 723,
    featured: true,
    createdAt: "2024-08-20T00:00:00Z",
    updatedAt: "2024-12-15T00:00:00Z",
    sampleCards: [
      { front: "Le Chatelier's principle", back: "System at equilibrium will shift to counteract imposed change (↑T shifts toward endothermic, ↑pressure shifts to fewer moles of gas)" },
      { front: "Nernst equation", back: "E = E° − (RT/nF)ln Q. At 25°C: E = E° − (0.0592/n)log Q" },
    ],
  },
  {
    id: "sci-002",
    title: "Organic Chemistry Mechanisms",
    description:
      "Arrow-pushing mechanisms for all major reaction types: substitution (SN1/SN2), elimination (E1/E2), addition, oxidation, and named reactions.",
    author: "curved_arrows",
    category: "Science",
    tags: ["organic-chemistry", "mechanisms", "university"],
    cardCount: 600,
    downloadCount: 12300,
    rating: 4.4,
    ratingCount: 445,
    createdAt: "2024-09-05T00:00:00Z",
    updatedAt: "2025-01-10T00:00:00Z",
    sampleCards: [
      { front: "SN2 characteristics", back: "Backside attack, inversion (Walden), bimolecular, favored by: primary substrate, strong nucleophile, polar aprotic solvent" },
      { front: "Aldol condensation product", back: "β-hydroxy carbonyl compound. Under basic conditions: enolate attacks aldehyde carbonyl → aldol → dehydration → α,β-unsaturated carbonyl" },
    ],
  },
  {
    id: "sci-003",
    title: "Biology: Cell Signaling & Pathways",
    description:
      "Key signaling cascades: GPCR, RTK, JAK-STAT, Wnt, Notch, Hedgehog, and NF-κB. Targets advanced undergrad / grad-level cell biology.",
    author: "signaling_nerd",
    category: "Science",
    tags: ["biology", "cell-biology", "signaling", "graduate"],
    cardCount: 450,
    downloadCount: 6700,
    rating: 4.3,
    ratingCount: 218,
    createdAt: "2025-01-25T00:00:00Z",
    updatedAt: "2025-02-20T00:00:00Z",
    sampleCards: [
      { front: "cAMP second messenger pathway", back: "GPCR (Gs) → adenylyl cyclase → ↑cAMP → PKA activation → phosphorylation of target proteins" },
    ],
  },

  // ── COMPUTER SCIENCE ──
  {
    id: "cs-001",
    title: "LeetCode Patterns: 14 Core Patterns",
    description:
      "Master the 14 essential problem-solving patterns that cover 80% of LeetCode problems. Sliding window, two pointers, BFS/DFS, dynamic programming, and more.",
    author: "algo_grinder",
    category: "Computer Science",
    tags: ["algorithms", "leetcode", "interview", "data-structures"],
    cardCount: 320,
    downloadCount: 34500,
    rating: 4.9,
    ratingCount: 1567,
    featured: true,
    createdAt: "2024-07-01T00:00:00Z",
    updatedAt: "2025-03-01T00:00:00Z",
    sampleCards: [
      { front: "When to use sliding window?", back: "Subarray/substring problems with a contiguous constraint. O(n) instead of O(n²). Fixed or variable window size." },
      { front: "Time complexity of binary search", back: "O(log n) — halves search space each iteration. Requires sorted input." },
      { front: "DFS vs BFS: when to use each?", back: "DFS: path finding, cycle detection, topological sort. BFS: shortest path in unweighted graph, level-order traversal." },
    ],
  },
  {
    id: "cs-002",
    title: "System Design Fundamentals",
    description:
      "Core concepts for system design interviews: CAP theorem, consistent hashing, load balancing, caching, databases, message queues, and trade-off analysis.",
    author: "infra_eng",
    category: "Computer Science",
    tags: ["system-design", "interview", "distributed-systems"],
    cardCount: 180,
    downloadCount: 22100,
    rating: 4.8,
    ratingCount: 934,
    createdAt: "2024-10-12T00:00:00Z",
    updatedAt: "2025-02-05T00:00:00Z",
    sampleCards: [
      { front: "CAP Theorem", back: "Distributed system can guarantee only 2 of 3: Consistency, Availability, Partition tolerance. In practice, P is unavoidable → choose CP or AP." },
      { front: "Read-through vs write-through cache", back: "Read-through: cache fetches on miss. Write-through: write to cache AND DB simultaneously. Write-back: write to cache, async to DB." },
    ],
  },
  {
    id: "cs-003",
    title: "Data Structures: Core Concepts",
    description:
      "Arrays, linked lists, stacks, queues, trees, graphs, heaps, and hash tables. Covers time/space complexity, operations, and when to use each structure.",
    author: "ds_fundamentals",
    category: "Computer Science",
    tags: ["data-structures", "fundamentals", "complexity"],
    cardCount: 400,
    downloadCount: 11200,
    rating: 4.5,
    ratingCount: 456,
    createdAt: "2024-12-01T00:00:00Z",
    updatedAt: "2025-01-15T00:00:00Z",
    sampleCards: [
      { front: "Hash table average case complexity", back: "Insert: O(1), Lookup: O(1), Delete: O(1). Worst case O(n) due to collisions. Space: O(n)." },
    ],
  },

  // ── MATHEMATICS ──
  {
    id: "math-001",
    title: "Linear Algebra: Theorems & Proofs",
    description:
      "Key theorems from Gilbert Strang's Linear Algebra. Eigenvalues, eigenvectors, SVD, orthogonality, matrix decompositions, and the four fundamental subspaces.",
    author: "eigenvalue_evan",
    category: "Mathematics",
    tags: ["linear-algebra", "university", "proofs"],
    cardCount: 220,
    downloadCount: 7800,
    rating: 4.6,
    ratingCount: 287,
    createdAt: "2024-11-01T00:00:00Z",
    updatedAt: "2025-01-08T00:00:00Z",
    sampleCards: [
      { front: "When is a matrix diagonalizable?", back: "Iff it has n linearly independent eigenvectors. Equivalent to: A = PDP⁻¹ where D is diagonal." },
      { front: "Rank-Nullity Theorem", back: "rank(A) + nullity(A) = n (number of columns). dim(col space) + dim(null space) = n." },
    ],
  },
  {
    id: "math-002",
    title: "Calculus Formula Master",
    description:
      "All essential calculus formulas from derivatives and integrals to multivariable calc, series, and vector calculus. Ideal for university students and exam prep.",
    author: "calc_central",
    category: "Mathematics",
    tags: ["calculus", "formulas", "university"],
    cardCount: 310,
    downloadCount: 9500,
    rating: 4.4,
    ratingCount: 398,
    createdAt: "2024-09-20T00:00:00Z",
    updatedAt: "2024-12-30T00:00:00Z",
    sampleCards: [
      { front: "∫ sec²(x) dx", back: "tan(x) + C" },
      { front: "Taylor series for eˣ", back: "Σ xⁿ/n! = 1 + x + x²/2! + x³/3! + ... (converges for all x)" },
    ],
  },

  // ── HISTORY ──
  {
    id: "hist-001",
    title: "World War II: Key Events & Dates",
    description:
      "Chronological coverage of WWII from rise of fascism through the postwar order. Battles, political decisions, key figures, and turning points on all fronts.",
    author: "history_buff42",
    category: "History",
    tags: ["wwii", "world-war-2", "modern-history"],
    cardCount: 350,
    downloadCount: 8900,
    rating: 4.5,
    ratingCount: 334,
    createdAt: "2024-10-05T00:00:00Z",
    updatedAt: "2025-01-22T00:00:00Z",
    sampleCards: [
      { front: "Operation Barbarossa", back: "June 22, 1941 — Germany invades USSR. Largest military operation in history. Ended Hitler's ability to fight a one-front war." },
      { front: "Battle of Midway significance", back: "June 4–7, 1942. US sank 4 Japanese carriers. Turning point in Pacific theater; halted Japanese expansion." },
    ],
  },
  {
    id: "hist-002",
    title: "Ancient Rome: Republic to Empire",
    description:
      "From the founding myths through the Principate. Covers the Punic Wars, the Gracchi, Julius Caesar, Augustus, and the transformation of the Roman constitution.",
    author: "classics_prof",
    category: "History",
    tags: ["rome", "ancient-history", "classical"],
    cardCount: 280,
    downloadCount: 5400,
    rating: 4.3,
    ratingCount: 201,
    createdAt: "2025-01-12T00:00:00Z",
    updatedAt: "2025-02-18T00:00:00Z",
    sampleCards: [
      { front: "What ended the Roman Republic?", back: "The Civil Wars (49–31 BC). Caesar crossed the Rubicon (49 BC); Octavian defeated Antony at Actium (31 BC) → became Augustus." },
    ],
  },

  // ── LAW ──
  {
    id: "law-001",
    title: "Bar Exam: Constitutional Law MBE",
    description:
      "All tested constitutional law topics for the MBE: judicial review, commerce clause, First Amendment, due process, equal protection, and individual rights.",
    author: "barprep_pro",
    category: "Law",
    tags: ["bar-exam", "constitutional-law", "mbe", "law-school"],
    cardCount: 900,
    downloadCount: 19800,
    rating: 4.7,
    ratingCount: 765,
    createdAt: "2024-08-10T00:00:00Z",
    updatedAt: "2025-02-28T00:00:00Z",
    sampleCards: [
      { front: "Strict scrutiny applies to:", back: "Fundamental rights (voting, travel, privacy) AND suspect classifications (race, national origin). Government must show compelling interest + narrowly tailored means." },
      { front: "Lemon test (Establishment Clause)", back: "Law must: (1) have secular purpose, (2) not primarily advance/inhibit religion, (3) not create excessive government entanglement." },
    ],
  },
  {
    id: "law-002",
    title: "Contracts MBE: Core Rules",
    description:
      "Essential contract law for the bar exam. Formation, consideration, defenses, breach, remedies, UCC Article 2, and third-party rights.",
    author: "contracts_queen",
    category: "Law",
    tags: ["contracts", "mbe", "bar-exam", "ucc"],
    cardCount: 750,
    downloadCount: 14300,
    rating: 4.6,
    ratingCount: 612,
    createdAt: "2024-09-01T00:00:00Z",
    updatedAt: "2025-01-25T00:00:00Z",
    sampleCards: [
      { front: "Mirror image rule (common law)", back: "Acceptance must be exactly equal to offer. Any deviation = rejection + counteroffer. (Contrast: UCC Battle of the Forms §2-207)" },
    ],
  },

  // ── GEOGRAPHY ──
  {
    id: "geo-001",
    title: "World Capitals & Countries",
    description:
      "All 195 UN-recognized countries and their capitals. Includes flag descriptions and regional groupings. Great for geography bees, trivia, and general knowledge.",
    author: "atlas_ace",
    category: "Geography",
    tags: ["geography", "capitals", "countries", "trivia"],
    cardCount: 390,
    downloadCount: 21000,
    rating: 4.4,
    ratingCount: 892,
    createdAt: "2024-07-20T00:00:00Z",
    updatedAt: "2024-11-30T00:00:00Z",
    sampleCards: [
      { front: "Capital of Kazakhstan", back: "Astana (formerly Nur-Sultan). Astana is a planned capital city in central Kazakhstan." },
      { front: "Capital of Sri Lanka", back: "Sri Jayawardenepura Kotte (official) / Colombo (commercial capital)" },
    ],
  },

  // ── MUSIC ──
  {
    id: "music-001",
    title: "Music Theory Fundamentals",
    description:
      "Scales, intervals, chord construction, progressions, voice leading, and modes. Ideal for musicians seeking a solid theory foundation from beginner to intermediate.",
    author: "theory_teacher",
    category: "Music",
    tags: ["music-theory", "scales", "chords", "beginner"],
    cardCount: 290,
    downloadCount: 7600,
    rating: 4.5,
    ratingCount: 318,
    createdAt: "2024-10-15T00:00:00Z",
    updatedAt: "2025-01-10T00:00:00Z",
    sampleCards: [
      { front: "A major scale intervals", back: "W-W-H-W-W-W-H → A B C# D E F# G# A. Relative minor: F# minor." },
      { front: "ii–V–I in C major", back: "Dm7 – G7 – Cmaj7. The most common jazz progression. Target tones on V7: 3rd (B) and 7th (F) resolve to Cmaj7." },
    ],
  },

  // ── ART ──
  {
    id: "art-001",
    title: "Art History: Movements & Artists",
    description:
      "Major Western and non-Western art movements from the Renaissance to contemporary art. Key artists, characteristics, and historical context for each movement.",
    author: "curator_kate",
    category: "Art",
    tags: ["art-history", "movements", "renaissance", "modernism"],
    cardCount: 260,
    downloadCount: 5100,
    rating: 4.3,
    ratingCount: 187,
    createdAt: "2024-11-08T00:00:00Z",
    updatedAt: "2025-02-01T00:00:00Z",
    sampleCards: [
      { front: "Characteristics of Impressionism", back: "Small visible brushstrokes, ordinary subject matter, emphasis on light/movement, painting en plein air. Key artists: Monet, Renoir, Degas." },
    ],
  },

  // ── BUSINESS ──
  {
    id: "biz-001",
    title: "MBA Finance Essentials",
    description:
      "Core financial concepts for MBA students and CFA candidates: DCF valuation, WACC, capital structure, options pricing, and financial statement analysis.",
    author: "wallstreet_prep",
    category: "Business",
    tags: ["finance", "mba", "cfa", "valuation"],
    cardCount: 420,
    downloadCount: 11700,
    rating: 4.6,
    ratingCount: 489,
    createdAt: "2024-09-25T00:00:00Z",
    updatedAt: "2025-02-10T00:00:00Z",
    sampleCards: [
      { front: "WACC formula", back: "WACC = (E/V)×Re + (D/V)×Rd×(1−T). E=equity value, D=debt value, V=E+D, Re=cost of equity, Rd=cost of debt, T=tax rate." },
      { front: "Black-Scholes inputs", back: "Stock price (S), Strike price (K), Time to expiry (T), Risk-free rate (r), Volatility (σ). C = S·N(d1) − Ke^(−rT)·N(d2)" },
    ],
  },

  // ── OTHER ──
  {
    id: "other-001",
    title: "Speed Reading & Memory Techniques",
    description:
      "Evidence-based techniques for faster reading and better retention: chunking, spaced repetition, mind mapping, the method of loci, and active recall strategies.",
    author: "learn_smarter",
    category: "Other",
    tags: ["study-skills", "memory", "productivity"],
    cardCount: 120,
    downloadCount: 8900,
    rating: 4.2,
    ratingCount: 423,
    createdAt: "2025-02-01T00:00:00Z",
    updatedAt: "2025-03-01T00:00:00Z",
    sampleCards: [
      { front: "Method of loci (memory palace)", back: "Associate items with locations along a familiar route. Retrieve by mentally 'walking' the route. Effective for ordered lists." },
    ],
  },
];
