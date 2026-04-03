# YouTube Parsing Guardrails
> Input validation, duration/length limits, and granular error handling for YouTube-based AI card generation.

---

## Overview

SEKEL-066 hardens the YouTube parsing pipeline that feeds AI card generation. Previously, raw user URLs were passed directly to the transcript fetcher with a single generic error message for all failure modes. This feature adds URL validation with canonical reconstruction, a 2-hour video duration limit, a 50K character transcript cap, and maps 12 distinct error types to user-facing messages.

## Architecture

All backend guardrails live in a single file; the frontend changes are minimal error display updates.

```
apps/desktop/src/
├── ipc/
│   └── document_parsing.ts        # URL validation, duration check, transcript cap, error mapping
├── lib/
│   └── documentParser.ts          # IPC error code extraction (renderer-side)
├── components/AIStudy/
│   ├── DocumentsPage.tsx          # Error-code-specific toast messages
│   └── DocumentUpload.tsx         # Replaced alert() with toast
└── locales/en/
    └── translation.json           # 12 new i18n error keys
```

### Validation Flow (in `parseYoutubeVideo`)

1. **URL validation** — `validateAndCanonicalizeYoutubeUrl()` parses the URL, validates trusted domains (`youtube.com`, `m.youtube.com`, `youtu.be`), extracts the 11-character video ID, checks query params against a whitelist (`v`, `si`, `t`, `list`), and returns a canonical `https://www.youtube.com/watch?v={id}` URL.
2. **Transcript fetch** — uses the canonical URL, never raw input.
3. **Duration check** — derives total video length from the last transcript item's `offset + duration`. Rejects videos over 7,200 seconds (2 hours).
4. **Transcript length cap** — truncates at 50,000 characters with a console warning. Non-blocking (processing continues with truncated text).
5. **Title fetch** — scrapes the video page title using the canonical URL.

### Error Propagation Through Electron IPC

Electron's `ipcMain.handle` serializes thrown values via structured clone, which strips custom properties from `Error` objects. To preserve error codes:

- **Backend** throws `new Error('[YOUTUBE_ERROR:code] message')`
- **Renderer** (`documentParser.ts`) parses the message with regex, extracts the code, and re-attaches it as `error.errorCode`
- **UI** (`DocumentsPage.tsx`) resolves `errors.youtube_{code}` i18n key, falling back to the generic `ai.error_video`

### Error Types

| Error Code | Trigger | User-Facing Message |
|---|---|---|
| `invalid_url` | URL cannot be parsed | Invalid YouTube URL. Please check the link and try again. |
| `invalid_domain` | Non-YouTube domain | Only youtube.com and youtu.be links are supported. |
| `invalid_video_id` | No valid 11-char video ID found | Could not find a valid video in this URL. |
| `suspicious_params` | Query params outside whitelist | This URL contains unsupported parameters. |
| `video_too_long` | Duration > 2 hours | This video exceeds the 2-hour limit. |
| `transcript_disabled` | Captions disabled by uploader | Captions are disabled for this video. |
| `video_unavailable` | Private, deleted, or age-restricted | This video is unavailable. |
| `rate_limited` | YouTube rate limiting | YouTube is temporarily blocking requests. |
| `transcript_not_available` | No transcript exists | No transcript is available for this video. |
| `language_not_available` | Transcript missing for requested language | Transcript is not available in your language. |
| `network_error` | Fetch failure | Could not connect to YouTube. |
| `transcript_too_long` | Transcript exceeds 50K chars (warning only) | The transcript was very long and has been trimmed. |

### Constants

Defined at the top of `document_parsing.ts`:

| Constant | Value | Purpose |
|---|---|---|
| `YOUTUBE_MAX_DURATION_SECONDS` | `7200` | 2-hour video limit |
| `YOUTUBE_MAX_TRANSCRIPT_CHARS` | `50_000` | Transcript truncation threshold |
| `YOUTUBE_ALLOWED_PARAMS` | `Set(['v','si','t','list'])` | Query param whitelist |

## Key Decisions

1. **Duration derived from transcript metadata** rather than a separate API call. The `youtube-transcript` library returns `offset` and `duration` per segment — the last segment's sum gives total video length. This avoids an extra HTTP request and no new dependency.
2. **Transcript truncation is non-blocking.** Long transcripts are trimmed to 50K chars with a warning rather than rejecting the video outright, since partial content still produces useful cards.
3. **Error codes encoded in Error message string** (`[YOUTUBE_ERROR:code]` prefix) because Electron IPC strips custom properties during structured clone serialization.
4. **Content category filtering was intentionally skipped.** YouTube's oEmbed API doesn't expose category, and the Data API v3 requires an API key. Additionally, Sekel is not limited to medical content — any subject is valid.
5. **Captions are a hard requirement.** Without a transcript there is no text to generate cards from. A Whisper-based audio transcription fallback was considered but deferred as a separate feature.

## Known Limitations / Future Work

- Duration is checked after the transcript is fetched (not before), since the library doesn't expose duration separately. For very long videos this means downloading a large transcript before rejecting, but transcripts are lightweight text (~100-200KB for 2 hours).
- Content category soft-warning requires a YouTube Data API key — left as a TODO comment.
- Audio transcription fallback (Whisper) for videos without captions is a potential future enhancement.
- i18n keys are only added for English; other locale files need matching translations.
