# Plan Integrity — Manual QA Flow
> Step-by-step manual test checklist for the SEKEL-139 plan-integrity work (trustworthy plan projections + stop-blank-coverage). For whoever is smoke-testing the branch before merge.

---

## Prerequisites
- Run the app: `npm run dev`.
- Set `OPENAI_API_KEY` in `.env.local` to exercise the classification tests (Section C).
- Have (or create) an **active plan**, ideally scoped to **2+ decks** with unstudied new cards, for the enforcement tests.
- Automated coverage: `npm test` (282/282 passing on this branch — remember the better-sqlite3 ABI toggle: `npm run rebuild:node` before tests, `npm run rebuild:electron` after, and close the app first).

## Known deferred behavior — expected, NOT bugs
- Classification runs **silently in the background** (no progress bar or "N awaiting classification" badge yet). Classify, then wait ~30–60s and revisit to see coverage update.
- With a global new-card budget active, per-deck **"new" badges on the Study hub can read higher** than Review All actually serves (per-deck count reconciliation is deferred).
- No **reclassify prompt** yet when switching to an exam with no classifications.
- The `plan` namespace is **English-only** (i18n deferred).

---

## A. Plan numbers are live & realistic

- [ ] **A1 — Live snapshot (the big one).** With an active plan, note "N days away" and "projected coverage %". Profile → Study → move the exam date a few weeks out → return to Plan. **Expect:** days-away and coverage update to the new date without recreating the plan. *(Previously frozen at creation.)*
- [ ] **A2 — Yield chips show a real spread.** Look at High / Medium / Low / Unclassified chips. **Expect:** a genuine mix, not almost-everything-High. *(Previously the ×100 scale bug made nearly all cards "High".)*
- [ ] **A3 — Weekly workload decays.** Expand the weekly projection. **Expect:** reviews/day and minutes/day ramp then **ease off** in later weeks (not a monotonic climb to an implausible number). Peak daily time is plausible for your limits.
- [ ] **A4 — Preview matches commit.** Start a new plan, note the peak time in the live preview, commit it. **Expect:** the committed plan's peak time matches the preview. *(Previously 8-week vs 16-week caps disagreed.)*
- [ ] **A5 — Local-time "days away".** Sanity-check the count matches your calendar (no longer off-by-one for time zones west of UTC).

## B. Global new-card budget + Sekel Intelligence

- [ ] **B1 — Multi-deck plan caps new cards globally (the big one).** Plan scoped to 2+ decks, rate ~20, unstudied new cards in each. Study hub → **Review All** (plan scope) → run the session and count the **new** cards. **Expect:** ~20 new **total**, not 20 per deck. Reviews/learning still appear from every deck.
- [ ] **B2 — Budget depletes across the day.** After B1, study some new cards, exit, start Review All again. **Expect:** remaining new = rate minus what you already did today across the scope (not a fresh full batch per deck).
- [ ] **B3 — Sekel Intelligence unchanged (requirement).** Dashboard → open a **Focused / weak-system** session. **Expect:** it still pulls all your struggling cards — the global new cap does **not** restrict it.

## C. Coverage & classification pipeline

- [ ] **C1 — Shelf-exam coverage populates.** With an NBME **shelf exam** as primary and classified cards, open System Coverage on the Plan page. **Expect:** rings populate. *(Previously blank — shelf exams ship no topics.)*
- [ ] **C2 — System status labels are honest.** Find a **never-studied** system and a **fully-studied** one. **Expect:** never-studied → **"Not started"** (neutral, not green "On track"); fully-studied → **"Covered"** (not "No data").
- [ ] **C3 — Classify on import.** Import an Anki deck (primary exam set). Wait ~30–60s, then check Profile → Study or Plan coverage. **Expect:** imported cards get classified automatically. *(Previously imports were never classified.)*
- [ ] **C4 — Classify on AI generation.** Generate AI cards and **Add** some to a deck. **Expect:** those cards get classified in the background.
- [ ] **C5 — Missing-key fail-fast (optional).** Temporarily remove `OPENAI_API_KEY`, run the manual **Classify** in Profile → Study. **Expect:** a clear error toast, not a silent "0 classified". With a key present and some cards failing, the result shows a "N failed" count.

## D. Exam switch cleans up

- [ ] **D1 — Old plan archives on switch.** With an active plan for exam A, switch your **primary exam** to exam B. **Expect:** the exam-A plan is **archived**, not left hidden/active. Switching back shows it in history, not as a live orphan.

---

## Reporting
If anything reads wrong, note the scenario ID (e.g. **B1**) and what you observed vs. expected.
