# Quiltor engineering profile

Reference inventory recorded on **2026-09-08** against the local working tree. Target baseline:
[1.0.0](README.md). Status: **partial**; this documentation change does not implement the gaps
below. Existing repository instructions and commands remain the current operational contract.

Source paths in this inventory are relative to the original Quiltor repository root, not to a
repository that later copies this standards directory. This is a dated source example; each
adopting project maintains its own profile.

## Formatting and toolchains

Active profiles: TypeScript/JavaScript/JSON/CSS, Markdown/YAML/HTML, Python and Rust.

| Authority  | Configuration                     | Current pin                                                                      |
| ---------- | --------------------------------- | -------------------------------------------------------------------------------- |
| Biome      | `biome.json`                      | `package.json`: 2.5.7                                                            |
| Prettier   | `.prettierrc`, `.prettierignore`  | `package.json`: 3.9.6                                                            |
| Ruff       | `pyproject.toml`                  | `distribution/toolchains.json`: 0.16.4; target `py312`                           |
| rustfmt    | `rust-toolchain.toml`             | Rust toolchain 1.98.0                                                            |
| Whitespace | `.editorconfig`, `.gitattributes` | UTF-8, LF, final newline, spaces 2; Python 4; Markdown preserves trailing spaces |

`distribution/toolchains.json` declares release Node
22.23.2, npm 10.9.8, Python 3.12.10 and Rust 1.98.0. These are the recorded project pins, not
versions mandated for all other projects. The root runtime dotfiles and CI carry copies.

## Actual commands

| Purpose                | Existing command and behavior                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript install     | `npm ci`                                                                                                                                     |
| Diagnostics            | `npm run doctor`; reports runtime deviations, exits nonzero on mismatch                                                                      |
| Complete local start   | `npm start`; Python API plus Vite                                                                                                            |
| Frontend only          | `npm run dev`; plain Vite, requires a separately available API                                                                               |
| Formatting             | `npm run format`; Biome, Ruff and Prettier                                                                                                   |
| Formatting check       | `npm run check:format`; same three formatters, without writes                                                                                |
| Rust formatting/check  | `cargo fmt --all` / `cargo --locked fmt --check`; currently separate                                                                         |
| Static checks          | `npm run check`; contracts, architecture, design, design system, i18n, platform, formatting                                                  |
| Production build       | `npm run build`; project gates, `tsc -b`, Vite output in tracked `dist/`                                                                     |
| Frontend unit tests    | `npm test`                                                                                                                                   |
| Backend tests, Windows | `py -3.12 -m unittest discover -s tests/python -t tests/python` with project dependencies installed in that interpreter and `PYTHONPATH=src` |
| Product and design E2E | `npm run test:e2e`; fresh built `dist/`, running Python server, installed Playwright Chromium                                                |
| Design only            | `npm run test:design`; separate Vite server                                                                                                  |
| Release preflight      | `npm run release:preflight`; exact release toolchains and full applicable release gates                                                      |
| Version update         | `npm run set-version -- patch`, `minor`, `major` or explicit stable version; clean working tree and preflight required                       |

Python npm helpers use `tools/dev/python.mjs` with `--needs` to
test required imports. The startup launcher has its own interpreter discovery logic; it currently
tests the Python version rather than using that dependency-aware resolver.

## Local services and freshness

| Mode/service         | Default                 | Configuration                                                |
| -------------------- | ----------------------- | ------------------------------------------------------------ |
| Vite via `npm start` | `http://127.0.0.1:5173` | `QUILTOR_DEV_PORT`; launcher passes strict port and loopback |
| API via `npm start`  | `http://127.0.0.1:8010` | `QUILTOR_API_PORT`                                           |
| Vite API proxy       | `http://127.0.0.1:8010` | `QUILTOR_API_TARGET` in `vite.config.ts`                     |
| Product E2E target   | `http://127.0.0.1:8010` | `PLAYWRIGHT_BASE_URL`                                        |
| Product/Docker       | Port 8000               | Separate deployment configuration                            |

The launcher waits for HTTP success from `/api/version` before Vite and `/` before reporting
ready. It labels logs and stops children on failure or Ctrl+C. Windows cleanup uses the owned
child PID with process-tree termination; POSIX cleanup currently signals the direct child only.

The API bind address defaults to loopback but can be overridden by `QUILTOR_HOST`. The source
launcher defaults to `<checkout>/data`; the installed CLI and desktop use their respective
per-user locations. `QUILTOR_DATA_DIR` overrides the data directory; `QUILTOR_HOME` changes the
legacy home containing `data`, runtime and model files. Separate source checkouts have separate
default data directories, while sessions using a shared checkout, override or installed host
need intentionally separate writable locations.

The Python product server serves built `dist/` and does not reload imported backend modules.
After frontend source changes, build before product E2E. After backend source changes, restart
the owned server. Unit and design tests use different paths and do not prove `dist/` freshness.

For an alternate local session, all current consumers need explicit configuration. This is a
PowerShell workaround, not automatic port propagation or proof of data isolation:

```powershell
$env:QUILTOR_API_PORT = "8110"
$env:QUILTOR_API_TARGET = "http://127.0.0.1:8110"
$env:QUILTOR_DEV_PORT = "5273"
$env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:8110"
npm start
```

Use the same test-target environment in the terminal that runs E2E. Check the effective data
directory too: shared overrides or installed-host defaults can still point both sessions at
the same writable data.

## Version and distribution

`VERSION` is the product version authority. The updater synchronizes that file,
`package.json`, both root version entries in `package-lock.json`, the Rust workspace version in
`Cargo.toml` and local crate entries in `Cargo.lock`. Python package metadata reads `VERSION`.
The updater accepts stable three-part versions, rejects a dirty working tree and non-increasing
versions, runs preflight, then replaces validated target files with rollback on failure.

`/api/version` currently returns backend product version information. It does not establish the
identity of the loaded frontend bundle or the checkout serving a development request.

Tracked `dist/` is intentional: Python and container distribution serve it. The frontend CI job
rebuilds and checks tracked differences; browser jobs depend on that job. This distribution
choice remains a Quiltor exception to the baseline default of ignoring generated output.

Release build and publication are separated in
`.github/workflows/README.md`. A version change reaching `main`
triggers the release build; successful eligible builds can trigger automatic publication. Build
artifacts are recorded by digest and publication verifies and promotes them without rebuilding.
The version updater itself does not commit or publish. Merging its result is release-affecting.

## Work remaining for baseline adoption

| Requirement                                | Current gap                                                                                                               | Follow-up                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Aggregate formatting covers every language | Rust runs separately in CI/release; aggregate format commands omit it and editor defaults do not specify Rust indentation | Include Rust in write/check aggregates and document its owner                                                                                 |
| Consistent formatter exclusions            | Ignore sets differ; Prettier's explicit ignore file is narrower than Biome's                                              | Inventory generated/local directories and align relevant exclusions                                                                           |
| One resolved startup configuration         | `QUILTOR_API_PORT` does not automatically update Vite's proxy target                                                      | Resolve and pass a shared backend URL; validate port inputs                                                                                   |
| Identifiable readiness                     | Probes accept HTTP success; no launch or checkout identity                                                                | Add identity verification and occupied-port/startup-failure coverage                                                                          |
| Reliable interpreter choice                | Startup discovery is separate from the import-aware Python helper                                                         | Share environment selection and verify required dependencies                                                                                  |
| Complete shutdown across systems           | POSIX cleanup signals direct children; spawning and failure paths need explicit coverage                                  | Verify process-tree cleanup and spawn-error handling on supported systems                                                                     |
| Parallel project/worktree isolation        | Default ports are shared; source data is checkout-local, but shared overrides and installed hosts need explicit isolation | Define a data/port contract across launch modes and test independent sessions                                                                 |
| Frontend build identity                    | API product version does not identify the loaded frontend build                                                           | Use a source-content digest for tracked assets; bind the release revision at packaging and regenerate versioned assets during version updates |
| Complete generated-output freshness        | CI's `git diff --quiet -- dist` detects tracked changes but does not enumerate untracked output                           | Include newly generated files in the freshness check                                                                                          |
| Non-drifting toolchain documentation       | Workflow README still names Python 3.11.9 in passages while executable configuration pins 3.12.10                         | Remove duplicated prose pins or validate/generated-document them                                                                              |

Verification for this profile: inspected configuration, launch/version implementation and CI;
runtime startup, shutdown and release execution were not performed for this documentation change.
