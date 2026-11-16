# Changelog

## [Unreleased]

## [1.7.0] - 2026-11-16

Release notes: [docs/releases/1.7.0.md](docs/releases/1.7.0.md).

### Added

- Agent team from agent-team 0.4.2 (roles, hooks, knowledge base `schedule1calc-kb`); old Codex coordination rules removed from `AGENTS.md` and `docs/PROJECT_PROFILE.md` (T-140).
- Fields and selects of the search and effect forms show an inline error message and a red error state for rejected values, linked to the field for assistive technology; the red border stays while the pointer is over the field (T-4, T-7).

### Changed

- The app follows the Studio direction of `webapp/design/DESIGN.md`: an own "Best Mix for Schedule I" wordmark over a drawn low-poly scene band, the calculator on a screen with a beige rim (paper white in Dusk, near black in Night), form and result as two equally high columns with "Get Best Mix" at the bottom of the form, one logo-green action colour, neutral inverted selection, profit as a banknote, money shown as `$70.00`, the mix as tiles with base product and step prices, effects as neutral pills with the game colour as a dot, a muted-green indeterminate progress bar that no longer restarts on every update, a short profit count-up and result fade-in (off under reduced motion), and the theme switch labelled System / Dusk / Night with unchanged stored values; Barlow is self-hosted with its OFL licence (T-14).
- The system colour scheme decides the theme by default; an explicit theme choice still wins (T-3).
- Every control has a target of at least 44 px, and the primary button shows a loading spinner while a search runs (T-4).
- Page layout uses one breakpoint set at 480 and 900 px, with side gutter and card padding of 16 px below 480 px and 24 px from there; on narrow screens the theme switch wraps below the title, and with large text its segments wrap into equal-width rows (T-5, T-7).
- Results of all three tabs read the same: the mix caption is "Mix", the effects caption "Effects · n", a stopped search shows its own "Search stopped — optimality not proven" badge, Your Recipe uses the result surface, the no-JS result uses the same texts, and the Barlow 700 font is preloaded so figures do not flash in the fallback font (T-6).
- Text, theme switch labels in every state and form placeholders reach a contrast of at least 4.5:1 in Dusk and Night, the increased-contrast and reduced-motion settings are honoured, and every control is reachable by keyboard with a visible focus ring; contrast and reduced motion are covered by tests (T-7).
