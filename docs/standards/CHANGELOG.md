# Changelog

All notable changes to the cross-project engineering standard (baseline version in
[README.md](README.md)). The format follows [Keep a Changelog 1.1.2](https://keepachangelog.com/en/1.1.2/).
Earlier versions (1.0.0 to 1.3.0) existed as separate copies in individual repositories and are not
recorded here.

## [Unreleased]

## [1.5.0] - 2026-11-08

### Added

- Branch convention (cicd.md rules 43 to 50, MUST): `main`, `task/<task-id>-<slug>`,
  `dev/<part-id>-<slug>`, `release/<x.y.z>`, `patch/<x.y>`, `kb`, `wt/<role>`; slug rule, one
  `task/` branch per task, releases only via `release/<x.y.z>`, forbidden prefixes, enforcement by
  hook and `agent-team check-branch` in CI.
- Rule 4 exception for a missing platform runner (for example Windows): recorded in the profile,
  evidenced per task by a local run; platform neutrality still needs the Linux run.
- Rule 6 lessons: a pinned wrapper is pinned only with the version of the binary it downloads, every
  gate also runs locally with `GITHUB_ACTIONS=true CI=true`, a pipe in a gate step sets `pipefail`,
  pins outside the package files are counted after an update.
- Rule 7c: measurements are taken under the same conditions. Rule 16a: publishing an existing
  version is rejected.
- Gitea Actions notes in cicd.md (runner labels, ignored annotations, unsupported features).

### Changed

- Rule labels are English: **MUST** and **RECOMMENDED** (earlier `MUSS` and `EMPFOHLEN`, which
  tools still accept). The draft keyword of the changelog is `Draft` (earlier `Entwurf`, still
  accepted).
- Rule 16: the tag sits on the merge commit of `release/<x.y.z>` in `main`, for patches in
  `patch/<x.y>`.
- Rule 19a: the commit proposal of `set-version` is `Prepare release <name> <version>`; only stable
  versions are accepted. Rule 19b refers to Keep a Changelog 1.1.2.
- Sub-rules (7a to 7c, 11a to 11e, 16a, 16b, 19a, 19b) are paragraphs of their own, not
  continuation text of the previous rule.
- Java exception in rule 1 of README section 2: 2 spaces, forced by google-java-format.
- This changelog follows Keep a Changelog itself.

## [1.4.0] - 2026-11-03

### Added

- The standard now lives as one source in the `@tim/agent-team` package (`docs/standards/`);
  `init` and `update` distribute it with a manifest.
- Every rule carries a visible label, mandatory or recommended.
- The format check is a gate: `check:format` runs `editorconfig-checker` and every active
  formatter in check mode, belongs to the verification entry point and CI, and fails with exit
  code other than 0 on any difference.
- Docker volumes must be named: top-level `volumes:` entry, `name:` in the scheme
  `<project>_<service>_<purpose>`, no anonymous volumes (cicd.md rule 25).
- Test and pipeline rules (cicd.md rules 1 to 24) are part of the standard: one entry point,
  gates proven red and green, no skips, exact pins, tag and release rules, secrets, deploy.
- New recommended check toolkit (cicd.md rules 28 to 38): typos, Markdown lint, gitleaks,
  osv-scanner, actionlint, shellcheck, hadolint, per-language and per-application-type checks.
- Runtime budget of the tests: a complete verification under 25 minutes is mandatory as a warning
  (not an error), with a duty to justify an overrun (cicd.md rules 39 to 42).
- New Ruff template `templates/formatting/ruff.template.toml` (`indent-width = 4`,
  `line-length = 100`).
- New Go profile in the formatting templates (`gofmt`).
- New rule (cicd.md rule 19a): the version is raised only through `set-version` (clean tree,
  strictly monotonic version, version files written provisionally and verified in that state,
  rollback on red, no commit/tag/push, changelog draft kept after a red run).
- New rule (cicd.md rule 19b): one `CHANGELOG.md` per versioned unit in Keep a Changelog 1.1.0 with
  fixed English categories; rule 16 takes the release notes from it.
- The CI/CD profile template is part of the template set.
- New Java profile (google-java-format, pinned, Google style, no configuration file; 2-space indent
  is the tool's); the Rust profile runs the pinned rustfmt directly, `Cargo.toml` at the root is
  not required.

### Changed

- Indentation is 4 spaces everywhere (JS/TS, JSON, CSS, HTML, Markdown, YAML, Python, Rust, shell,
  PowerShell); only Makefile and Go use tabs. Biome `indentWidth: 4`, Prettier `tabWidth: 4`.
- `.editorconfig` template: `indent_size = 4` everywhere, tabs for `*.go` (as `gofmt` writes
  them), PowerShell and `.cmd` sections added.
- The CI/CD guidance of 1.3.0 is merged into `cicd.md` together with the new rules, without
  duplicates.
