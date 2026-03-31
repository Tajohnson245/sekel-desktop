# Image Occlusion
> Visual flashcard creation by drawing shapes over images — each masked area becomes a separate flashcard to study.

---

## Overview

Image Occlusion lets users upload any image and draw shapes over parts to memorize. Each shape (or group of shapes) becomes a separate flashcard card, shown with that area masked during study. This is ideal for anatomy diagrams, pathology slides, biochemical pathways, geography, or any visual content where recall is spatial.

## Architecture

```
apps/desktop/src/components/ImageOcclusion/
└── ImageOcclusionEditor.tsx    — Full editor: upload, draw, group, deck select, save

apps/desktop/src/lib/types.ts   — OcclusionShape, OcclusionRectShape,
                                   OcclusionEllipseShape, OcclusionPolygonShape,
                                   IOMode types

apps/desktop/src/lib/storage.ts — uploadImage() — saves image to {userData}/media/

apps/desktop/src/hooks/
├── useDecks.ts                 — Deck list for target deck selection
└── useNotes.ts                 — useCreateNote, useNoteTypes, useCreateNoteType
```

Occlusion cards use a dedicated built-in note type (`Image Occlusion`) with fields: `Header`, `Image` (sekel-media:// URL), `Shapes` (JSON array of OcclusionShape), `ActiveIndex`, `IOMode`, and `BackExtra`.

## Shape Types

All shapes store coordinates as **percentages of image dimensions** (not pixels), so cards scale correctly regardless of image size or display resolution.

| Shape | How to draw | Best for |
|-------|-------------|----------|
| **Rectangle** | Drag to cover a rectangular area | Text labels, table cells, rectangular structures |
| **Ellipse** | Drag to draw an oval or circle | Round organs, curved regions |
| **Polygon** | Click to place vertices; close shape by clicking the first point | Irregular organs, country borders, non-rectangular labels |

## Study Modes (IOMode)

Each set of cards created from one image can use one of three occlusion modes:

| Mode | Front behavior | Back behavior |
|------|----------------|---------------|
| `hide-all-guess-one` | All shapes masked; target shape highlighted | All shapes revealed |
| `hide-one-guess-one` | Only the target shape masked; rest of image visible | Target shape revealed |
| `hide-all-reveal-all` | All shapes masked | All shapes revealed simultaneously |

Mode is selected at card creation time and applies to all cards from that image batch.

## Grouping

Multiple shapes can be grouped into a single card unit:
- Select multiple shapes (Shift+click or drag-select)
- Click the **Group** button in the toolbar
- The grouped shapes share a `groupId` and are treated as one card unit
- During study, all shapes in a group are masked/revealed together

**Ungrouping:** select the group and click **Ungroup** to break it back into individual card units.

## Creating Occlusion Cards (step by step)

```
1. Open Image Occlusion from the sidebar
2. Upload an image (photos, screenshots, diagrams)
3. Select a shape tool: Rectangle, Ellipse, or Polygon
4. Draw shapes over each area to memorize
5. (Optional) Group related shapes:
   Shift+click shapes → click Group
6. (Optional) Add a Header (text shown above the image during study)
7. (Optional) Add BackExtra (extra notes shown on the answer side)
8. Select IOMode (default: hide-all-guess-one)
9. Select target deck from the dropdown
   (Or click "New Deck" to create one inline)
10. Click "Create Cards"
    → Image saved to {userData}/media/ via uploadImage()
    → One note created per card unit (shape or group)
    → All cards immediately available in the selected deck
```

The card count preview updates live as shapes are drawn and grouped.

## During Study

The card front shows the image with the target area(s) filled in a contrasting mask color. The user recalls what is hidden, then presses Spacebar or clicks to reveal. The back shows the unmasked image (and BackExtra text if set).

## Key Decisions

1. **Percentage-based coordinates** — shapes store `x`, `y`, `w`, `h` (rectangles), `cx`, `cy`, `rx`, `ry` (ellipses), or `points[]` (polygons) as percentages. This means the same card renders correctly on any screen size and if the source image is replaced.

2. **SVG overlay** — the mask layer is an SVG element overlaid on the image via CSS positioning. This keeps the original image intact and allows crisp shape rendering at any zoom level.

3. **One note per card unit** — each shape unit (ungrouped shape or group) creates a separate note with the same image URL and full shapes JSON, but a different `ActiveIndex`. This keeps the data model simple and compatible with the standard note/card structure.

## Known Limitations / Future Work

- No shape editing after creation — shapes cannot be repositioned once the cards are saved (requires deleting and recreating)
- No import of image occlusion cards from Anki (Anki uses a different occlusion format)
- Images are stored locally and do not sync to cloud
