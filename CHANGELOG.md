# Changelog

## [Unreleased]

### Added

- Agent team from agent-team 0.4.2 (roles, hooks, knowledge base `schedule1calc-kb`); old Codex coordination rules removed from `AGENTS.md` and `docs/PROJECT_PROFILE.md` (T-140).
- Fields and selects of the search and effect forms show an inline error message and error state for rejected values, linked to the field for assistive technology (T-4).

### Changed

- Design tokens follow the HIG-first token plan of `webapp/design/DESIGN.md` v3: neutral light and dark surfaces, system font without monospace, the game green only on the primary button, blue focus ring and links, teal success; the system colour scheme now decides by default and the explicit theme choice still wins (T-3).
- Controls and content components follow the HIG-first component table of `webapp/design/DESIGN.md` v3: one 44 px target height, flat segmented controls, quiet destructive buttons, pill chips and badges with status glyphs, soft-fill option cards and alerts, and a loading spinner in the primary button; the game green is used only for the primary action (T-4).
- Page layout follows `webapp/design/DESIGN.md` v3 section 6: one breakpoint set at 480 and 900 px (the 400, 560 and 640 px queries are folded in), side gutter and card padding 16 px below 480 px and 24 px from there, effect option cards with 12 px padding at every width, and the app header on the canvas without the `$` mark, with the page-title role at every width and the theme switch wrapping below the title on narrow screens (T-5).
