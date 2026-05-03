# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-03-11

### Added
- Stylescape design token CSS layer (`packages/components/src/components.css`) with full INK surface palette, teal/amber/rose/violet accent system, Outfit/DM Mono/DM Serif Display typography, spacing scale, and backward-compat aliases
- Per-component CSS files for all shared UI components: Button, Input, Select, Modal, Loader, Icons
- Per-component CSS files for all shared chart components: RetentionTrendChart, RatingDistributionChart, LapseStatsChart, ReviewHeatmap
- `style` and `./style` export added to `@sekel/components` package.json for explicit CSS consumers

### Changed
- Desktop app `index.css` `:root` block fully replaced with Stylescape tokens; backward-compat aliases keep unmigrated component files working
- Desktop logo switches from blue→cyan gradient to DM Serif Display in plain fog color
- Nav hover/active state changes from hardcoded blue to `var(--teal-soft)` / `var(--teal)`
- Rating buttons rewritten to ROSE/AMBER/TEAL/VIOLET `data-rating` attribute system — removes hardcoded hex colors and `--rating-color` inline style pattern
- `Auth.css` danger states migrated from `color-mix()` / hardcoded red to `var(--rose)` / `var(--rose-soft)`
- `Dashboard.css` heatmap cells migrated from `var(--primary)` to `var(--teal)` opacity steps; orphan vars (`--card`, `--foreground`, `--muted-foreground`) replaced with Stylescape equivalents
- `StudySession.css` analytics chart background and lapse rate display updated to Stylescape tokens
- Desktop `index.html` CSP updated to allow Google Fonts; preconnect and font link tags added
- `RatingButtons.tsx` updated to emit `data-rating` attribute instead of inline `--rating-color` custom property

## [1.2.0] - 2026-03-11

### Added
- Marketing site mobile responsiveness across all sections

## [1.1.0] - 2026-02-28

### Added
- Resend waitlist API integration
- `/privacy` and `/terms` legal pages
- Footer links updated

### Fixed
- Vercel build: lazy Resend init, turbo `passThroughEnv`, zod v4 email validation
- Navbar display in light mode

## [1.0.0] - 2026-02-01

### Added
- Initial monorepo setup with Turborepo and npm workspaces
- `@sekel/desktop` — Electron + Vite + React app with FSRS-based flashcard study sessions
- `@sekel/web` — Next.js marketing site
- `@sekel/db` — Shared Supabase client package
- Supabase authentication (login, signup, protected routes)
- Deck management (create, edit, delete decks and cards)
- AI card generation via OpenAI SDK
- Image occlusion editor
- Study session with spaced repetition (ts-fsrs)
- Session analytics: retention trend, rating distribution, lapse stats, review heatmap
- Rich text card editor (Quill)
- Draft tray for unsaved cards
- Theme provider (dark/light mode)

[Unreleased]: https://github.com/Tajohnson245/sekel-desktop/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/Tajohnson245/sekel-desktop/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Tajohnson245/sekel-desktop/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Tajohnson245/sekel-desktop/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Tajohnson245/sekel-desktop/releases/tag/v1.0.0
