# Drafts
> Pending tray for AI-generated cards, reviewed and promoted to a deck before entering the study library.

---

## Overview

Drafts is an inbox for AI-generated flashcards. When the AI card generator produces cards, they land in Drafts rather than going directly into a deck. The user reviews each draft, selects a target deck, and promotes it — or discards it. This acts as a quality gate, keeping users in control of what enters their study library.

## Architecture

```
apps/desktop/src/components/Drafts/
├── DraftsPage.tsx          — Full-page draft management view (/drafts route)
└── DraftTray.tsx           — Compact tray variant (used inline in card generator)

apps/desktop/src/hooks/
└── useDrafts.ts            — useDrafts, useSaveDraft, useDeleteDraft,
                               useClearDrafts, usePromoteDraftToDeck;
                               DRAFT_LIMIT = 5

apps/desktop/src/lib/queries.ts — fetchDrafts, insertDraft, deleteDraft,
                                    promoteDraftToDeck
```

Draft records are stored in the `card_drafts` SQLite table: `id`, `user_id`, `front`, `back`, `source` (document name or URL), `created_at`.

## Capacity

The drafts tray holds a maximum of **5 cards** (`DRAFT_LIMIT = 5`). When full:
- The "Save Draft" button in the AI card generator is disabled with a message: "Drafts full (5/5)"
- New AI-generated cards cannot be saved until existing drafts are promoted or deleted

## Workflow

```
AI card generator produces a card
  ↓
Card saved to card_drafts table
  ↓
User opens Drafts page (or sees DraftTray inline)
  ↓
For each draft:
  - Review front and back text
  - Select target deck from dropdown
  - Click "Promote" → card created in that deck, draft deleted
  OR
  - Click "Delete" → draft removed
  OR
  - Click "Clear All" → all drafts deleted at once
```

Promoted cards enter the deck as state `new`, immediately available for study.

## Display

**Drafts page (`/drafts`):**
- Capacity indicator: "X / 5 drafts" with a progress bar; turns amber when full
- Page description: explains the 5-card limit and the promote flow
- Each draft card shows: front text, back text (truncated), source label, creation timestamp
- Deck selector dropdown per card
- Promote and Delete buttons per card
- Clear All button at the top

**Draft Tray (inline in AI generator):**
- Compact view of pending drafts shown alongside the card generator
- Same promote/delete actions available without navigating away

## Key Decisions

1. **Capacity limit of 5** — drafts are a review queue, not a long-term storage area. A small limit encourages users to process drafts promptly rather than letting a backlog accumulate. It also prevents the database from accumulating large numbers of unreviewed AI-generated cards.

2. **Drafts are per-user, not per-deck** — drafts from multiple documents can coexist. The user routes each draft to whichever deck is appropriate at promote time, not at generation time.

3. **No auto-promotion** — AI suggestions never enter a deck automatically. This was an intentional product decision: AI output quality varies, and users should review before it affects their study schedule.

## Known Limitations / Future Work

- No editing of draft content — front and back are fixed after generation (user must promote and then edit the card)
- Source label is stored as a plain string (filename or URL) with no link back to the original document
- Drafts do not persist across devices (local SQLite only)
