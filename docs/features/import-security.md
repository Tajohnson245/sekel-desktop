# Import Security Hardening
> Protections against injection, DoS, and data corruption when importing .spkg and .apkg deck packages.

---

## Overview

Sekel supports importing decks as `.spkg` (native JSON-in-ZIP) and `.apkg` (Anki SQLite-in-ZIP). Because these files come from untrusted sources, the import pipeline must defend against XSS injection in card content, database corruption from malformed data, denial-of-service via oversized archives, and arbitrary file reads through the media protocol. This feature hardens every layer of the import path.

## Architecture

```
apps/desktop/src/main/import/
├── spkgSchema.ts        — JSON schema validators for .spkg entities
├── limits.ts            — Archive and file size limit constants + assertions
├── sanitizeFields.ts    — Import-time HTML sanitization (isomorphic-dompurify)
├── mediaValidation.ts   — Magic-byte file type detection (file-type) + SVG sanitization
├── sekel.ts             — .spkg import (wired to all of the above)
├── apkg.ts              — .apkg ZIP extraction (wired to limits)
├── insertionEngine.ts   — Anki data insertion (wired to sanitizeFields)
└── media.ts             — Media extraction (wired to limits + mediaValidation)

apps/desktop/src/
├── main.ts              — BrowserWindow hardening + sekel-media:// path confinement
├── lib/sanitize.ts      — Renderer-side DOMPurify (unchanged, defense-in-depth layer)
└── index.html           — Tightened Content Security Policy
```

### Defense Layers

| Layer | Threat | Protection |
|-------|--------|------------|
| Archive loading | Zip bomb / DoS | Size limits (500 MB archive, 2 GB decompressed, 1M entries) |
| JSON parsing | Malformed data / DB corruption | Schema validation with type, field, and bounds checking |
| Card content | XSS via `<script>`, `onerror`, `javascript:` | DOMPurify sanitization at import time AND render time |
| Card templates | XSS in Anki qfmt/afmt | Template-aware sanitization preserving `{{FieldName}}` syntax |
| Media files | Disguised executables | Magic-byte detection; rejects files whose content doesn't match extension |
| SVG media | Embedded scripts in SVGs | SVG-profile DOMPurify sanitization before writing to disk |
| Media serving | Arbitrary file read | Path confinement check on `sekel-media://` protocol handler |
| Renderer | Privilege escalation | Explicit `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` |
| CSP | Inline script injection | SHA-256 hash replaces `'unsafe-inline'`; `object-src`, `frame-src`, `base-uri` locked down |

### Pre-existing Protections (unchanged)

- Parameterized SQL queries throughout (no SQL injection)
- `path.basename()` on ZIP entries (no path traversal)
- UUID regeneration on import (no ID collision)
- Read-only SQLite for .apkg parsing
- SHA1-based media storage (no filename overwrites)
- Electron Fuses in forge.config.js (RunAsNode disabled, ASAR integrity)
- DOMPurify at render time on all `dangerouslySetInnerHTML` calls

## Key Decisions

1. **Hand-written validators instead of zod** — The desktop app doesn't use zod. Adding a schema library for one use case adds dependency weight without proportional benefit. The validators are straightforward type/bounds checks.

2. **isomorphic-dompurify for main-process sanitization** — DOMPurify requires a DOM. `isomorphic-dompurify` wraps jsdom to provide this in Node.js. This was chosen over regex-based stripping because DOMPurify is battle-tested and already trusted in the renderer.

3. **Template placeholder preservation** — Anki card templates contain `{{FieldName}}` and `{{c1::cloze}}` syntax that DOMPurify would strip. The sanitizer replaces these with numbered placeholders before sanitization, then restores them after.

4. **SVG sanitization rather than rejection** — Anki decks legitimately use SVG images. Rejecting them would break real imports. Instead, SVGs are sanitized with DOMPurify's SVG profile, which strips `<script>`, event handlers, and external references while preserving the visual content.

5. **CSP SHA-256 hash for inline script** — The theme-detection script in `index.html` is static and deterministic. Using a content hash is safer than `'unsafe-inline'` and doesn't require refactoring the script into a separate file.

6. **`sandbox: true` on BrowserWindow** — This restricts the renderer process at the OS level. The preload script only uses `contextBridge` and `ipcRenderer`, both of which work under sandbox mode.

## Known Limitations / Future Work

- **No package signing** — .spkg files have no integrity verification (checksums or signatures). Worth adding if community deck sharing becomes a feature.
- **No import rate limiting** — A user could repeatedly trigger imports. Not a concern for desktop but would matter for a server-side import API.
- **Anki .apkg JSON fields not schema-validated** — The `col` table's `models`/`decks`/`dconf` JSON columns are parsed without schema checks. The Anki format is complex and varies across versions, making strict validation fragile. Parameterized queries and sanitization mitigate the risk.
- **`file-type` detection gaps** — Some audio formats (WAV, OGG) may not be reliably detected by magic bytes alone. Files that can't be identified are rejected, which could cause false positives for edge-case audio files.
