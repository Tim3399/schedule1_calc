# Changelog

## [Unreleased]

### Added

- Agent team from agent-team 0.4.2 (roles, hooks, knowledge base `schedule1calc-kb`); old Codex coordination rules removed from `AGENTS.md` and `docs/PROJECT_PROFILE.md` (T-140).
- Fields and selects of the search and effect forms show an inline error message and error state for rejected values, linked to the field for assistive technology (T-4).

### Changed

- Design tokens follow the HIG-first token plan of `webapp/design/DESIGN.md` v3: neutral light and dark surfaces, system font without monospace, the game green only on the primary button, blue focus ring and links, teal success; the system colour scheme now decides by default and the explicit theme choice still wins (T-3).
- Controls and content components follow the HIG-first component table of `webapp/design/DESIGN.md` v3: one 44 px target height, flat segmented controls, quiet destructive buttons, pill chips and badges with status glyphs, soft-fill option cards and alerts, and a loading spinner in the primary button; the game green is used only for the primary action (T-4).
- Page layout follows `webapp/design/DESIGN.md` v3 section 6: one breakpoint set at 480 and 900 px (the 400, 560 and 640 px queries are folded in), side gutter and card padding 16 px below 480 px and 24 px from there, effect option cards with 12 px padding at every width, and the app header on the canvas without the `$` mark, with the page-title role at every width and the theme switch wrapping below the title on narrow screens (T-5).
- The app follows the Studio direction of `webapp/design/DESIGN.md` v4: an own "Best Mix for Schedule I" wordmark over a drawn low-poly scene band, the calculator on a screen with a beige rim (paper white in Dusk, near black in Night), form and result as two equally high columns with "Get Best Mix" at the bottom of the form, one logo-green action colour, neutral inverted selection, profit as a banknote, money shown as `$70.00`, the mix as tiles with base product and step prices, effects as neutral pills with the game colour as a dot, a muted-green indeterminate progress bar that no longer restarts on every update, a short profit count-up and result fade-in (off under reduced motion), and the theme switch labelled System / Dusk / Night with unchanged stored values; Barlow is self-hosted with its OFL licence (T-14).
- Results of all three tabs read the same: the mix caption is "Mix", the effects caption "Effects · n", a stopped search shows its own "Search stopped — optimality not proven" badge, Your Recipe uses the result surface, the no-JS result uses the same texts, and the Barlow 700 font is preloaded so figures do not flash in the fallback font (T-6).

### Fixed

- With large text on narrow screens the theme switch wraps its segments into equal-width rows instead of letting "System" run out of its segment, and an invalid field keeps its red border while the pointer is over it (T-7). The theme switch labels stay at 4.5:1 or more on the hover and pressed tints (6 % and 10 % instead of 14 % and 24 %), and every placeholder uses the tertiary text colour instead of the browser default grey; both are covered by the contrast test (T-7).
