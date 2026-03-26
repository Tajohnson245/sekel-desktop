# Quill Media Protocol Integration
> Documents how the sekel-media:// custom protocol works with ReactQuill's URL sanitizer in the desktop app.

---

## Overview

The desktop app uses a custom Electron protocol (`sekel-media://`) to serve images and audio from local disk. When users add images to cards via the rich text editor (ReactQuill), the editor must accept these custom-protocol URLs. By default, Quill rejects any URL scheme that isn't `http:`, `https:`, or `data:`, silently replacing them with `//:0` — which renders as a broken image.

## Architecture

```
User uploads image
  → uploadImage() (lib/storage.ts)
  → IPC: db:saveMediaFile
  → File saved to AppData/media/{hash}.{ext}
  → Returns sekel-media://{userId}/{filename}
  → Quill inserts <img src="sekel-media://...">
  → Electron protocol handler (main.ts) serves file from disk
```

Key files:

- `apps/desktop/src/components/UI/RichTextEditor.tsx` — Quill wrapper with custom Image format override
- `apps/desktop/src/main.ts` — Electron protocol handler for `sekel-media://`
- `apps/desktop/src/lib/storage.ts` — Image upload via IPC
- `apps/desktop/src/lib/mediaResolver.ts` — Resolves bare Anki filenames to `sekel-media://` URLs
- `apps/desktop/src/components/Card/NoteEditor.tsx` — Card editor, resolves media before passing to Quill

## Key Decisions

1. **Quill Image format override** — Quill's `formats/image` has a static `sanitize()` method hardcoded to only allow `http`, `https`, and `data` schemes ([source](https://github.com/slab/quill/blob/main/packages/quill/src/formats/image.ts)). We extend the base `Image` format with a `SekelImage` class that passes `sekel-media://` URLs through, then register it with `Quill.register('formats/image', SekelImage, true)`. This runs once at module scope before any editor renders.

2. **Protocol scheme registration** — The `sekel-media://` scheme is registered with `standard: true` in `protocol.registerSchemesAsPrivileged()`. Without this flag, Chromium does not properly resolve custom-scheme URLs in `<img>` tags.

3. **Media resolution in the editor** — Imported Anki cards store bare filenames (`<img src="image.jpg">`). The study/review pipeline resolves these via `resolveMediaInHtml()`, but the card editor loads raw field content. `NoteEditor.tsx` calls `resolveMediaInHtml()` before passing content to Quill so imported card images also display correctly.

4. **CSP allowlist** — The Content Security Policy in `index.html` includes `sekel-media:` in both `img-src` and `media-src` directives.

## Known Limitations / Future Work

- Clipboard paste of images is not yet handled — only the toolbar button upload works
- If Quill is upgraded, the `SekelImage` override must be verified against any changes to the base `Image.sanitize()` method
