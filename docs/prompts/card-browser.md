# Card Browser — Build Prompt
> Plan for showing individual cards (not notes) in the deck detail page, and moving Anki import docs to their own branch.

---

## Overview

The deck detail page currently shows **notes**. One Anki note generates multiple cards from different templates, so users can't see or manage individual cards. This plan replaces the note list with a full card browser.

---

## Part 1 — Docs Branch

Docs changes from SEKEL-038 (uncommitted) move to `SEKEL-039-docs-update` from `dev`:
- `docs/features/anki-import.md` — new file documenting the full .apkg import pipeline
- `docs/features/sqlite-implementation.md` — adds the NMV mismatch / forge preStart hook fix

---

## Part 2 — Card Browser (`SEKEL-040-card-browser` from `dev`)

### Layer-by-layer changes

| Layer | Change |
|-------|--------|
| `service.ts` | Add `fetchAllCardsByDeck(deckId)` — `CARD_WITH_NOTE_SQL WHERE n.deck_id = ?`, no limit, ORDER BY `c.created_at ASC` |
| `service.ts` | Add `deleteCard(cardId)` — `DELETE FROM cards WHERE id = ?` + `deleteRecord('cards', cardId)` |
| `ipc/database.ts` | Register `db:fetchAllCardsByDeck` and `db:deleteCard` handlers |
| `preload.ts` | Expose both under `window.electronAPI.db` |
| `types/electron.d.ts` | Type both new methods |
| `lib/queries.ts` | Add renderer-side shims |
| `hooks/useDecks.ts` | Add `useCardsByDeck(deckId)` and `useDeleteCard()` |
| `CardList.tsx` | Accept `cards: CardWithNote[]` + `isLoading`; render one row per card |
| `DeckDetail.tsx` | Use `useCardsByDeck`; pass cards down to CardList |
| `CardList.css` | Add `.card-state-badge` colored pill styles |

### CardList row design

Each card row shows:
- **Front preview** — `fields.Front ?? Object.values(fields)[0]` (HTML stripped)
- **Back preview** — `fields.Back ?? Object.values(fields)[1]`
- **State badge** — New (blue) / Learning (orange) / Review (green) / Relearning (red)
- **Template label** — "Card 1", "Card 2" etc. when note has >1 template (from `template_index`)
- **Edit** → opens NoteEditor with `card.note`
- **Delete** → deletes just this card (not the note)

### CardList new prop interface

```typescript
interface CardListProps {
    cards: CardWithNote[];
    isLoading: boolean;
    onAddCard: () => void;
    onGenerateAI?: () => void;
    onEdit?: (note: Note) => void;
}
```

### Utilities to reuse

- `CARD_WITH_NOTE_SQL` + `mapCardWithNote()` in `service.ts`
- `deleteRecord()` in `syncPush.ts` for Supabase sync on delete
- `deckKeys` in `useDecks.ts` — add `allCardsBrowse` key variant
- Existing `Modal` + `Button` for delete confirm in CardList

### Verification

1. `npx turbo run typecheck lint --filter=@sekel/desktop` — clean
2. Open deck with 107 Anki cards → see 107 rows (not 20 notes)
3. Click edit → NoteEditor opens with parent note
4. Delete a card → removed from list, other cards from same note remain
