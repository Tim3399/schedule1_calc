# Cross-project engineering standard

Baseline version: **1.0.0**. Derived from Quiltor on **2026-09-08**.

This is the reusable baseline for the owner's projects. Adoption is explicit per repository;
adding this directory does not change tooling or make another project compliant. Normative
requirements below describe the target. [Quiltor's profile](quiltor.md) records current behavior
and the remaining work separately.

Start a new project with the [project profile template](templates/PROJECT_PROFILE.md) and the
[formatting templates](templates/formatting/README.md). Merge the
[agent instruction fragment](templates/agent-instructions.md) into the project's existing
instructions so coding agents use the same commands and constraints as developers.

## 1. One baseline, explicit project choices

Every adopting repository records the baseline version, active language profiles, command map,
runtime pins, local services, version source, CI gates and exceptions in
`docs/PROJECT_PROFILE.md`. Store a copy of this baseline and its required templates under
`docs/standards/`, or link to an immutable revision in a shared standards repository. A floating
link to another project's working tree is insufficient.

Requirements apply only to capabilities the project actually has. A static frontend does not
need Python, an API server, containers or native signing. Existing projects may retain a working
package manager or framework command convention by recording the equivalent commands. New
JavaScript/TypeScript projects use npm with a committed lockfile by default.

An exception names the requirement, reason, actual behavior and condition for reviewing it.
An unimplemented requirement is recorded as pending, not as a passing check. Changes to the
baseline are reviewed and versioned independently of product releases: breaking requirements
increment its major version, compatible additions its minor version, and clarifications its patch.

## 2. Deterministic formatting

Each source file type has one authoritative formatter. Editor settings support that formatter;
they do not replace the command-line and CI checks.

| Files                                                  | Authority                              | Baseline                                                                                   |
| ------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| JS, JSX, MJS, CJS, TS, TSX                             | Biome                                  | Spaces, indent 2, width 100, double quotes, semicolons, trailing commas, arrow parentheses |
| JSON, JSONC, CSS                                       | Biome                                  | Spaces, indent 2, width 100; CSS double quotes                                             |
| Python                                                 | Ruff                                   | Spaces, indent 4, width 100, double quotes; target the oldest supported Python             |
| Markdown, YAML, HTML                                   | Prettier                               | Spaces, indent 2, width 100, preserve prose wrapping                                       |
| Rust                                                   | rustfmt from the pinned Rust toolchain | Tool defaults unless the Rust profile declares overrides                                   |
| Other formats, including framework-specific components | Project profile                        | Assign a compatible owner before enabling a formatter                                      |

Text is UTF-8 with LF and a final newline. Remove trailing whitespace except where Markdown
uses it deliberately. `.editorconfig` records editor defaults and `.gitattributes` contains
`* text=auto eol=lf` so Windows checkouts preserve the same text bytes. Makefile recipes retain
tabs; Python and Rust use four-space editor indentation.

Keep formatter scopes disjoint, including embedded code. Exclude dependencies, generated builds,
caches, vendored assets and local runtime data explicitly. Generated files that remain committed
must be reproduced by their generator, not manually reformatted. Lockfiles belong to their
package manager; exclude them from writing formatters when their serialization differs.

`format` writes formatting changes. `check:format` verifies all active language profiles without
writing and exits nonzero on differences. Both use the same pinned tools and scopes; include
Rust when present. Linting, import reordering and type checking are separately named operations.
CI runs the check command; formatting on save and local hooks are conveniences.

For adoption, format the affected files first and put any repository-wide normalization into
a dedicated change. Do not mix it into a functional change or overwrite unrelated local edits.

## 3. Predictable commands and toolchains

For an npm-based project, expose this command interface. A profile may document equivalent
commands where an established framework or another language requires them.

| Command                        | Meaning                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `npm ci`                       | Install the committed JavaScript dependency graph                                             |
| `npm run doctor`               | Report required runtimes, versions and dependencies; give actionable failures                 |
| `npm start`                    | Start the complete local application, including required services                             |
| `npm run dev`                  | Start only the frontend with hot reload; document its backend requirement                     |
| `npm run format`               | Format every active language profile                                                          |
| `npm run check:format`         | Check the same formatting scopes without writing                                              |
| `npm run check`                | Run static quality gates; enumerate them in the profile                                       |
| `npm run build`                | Type-check compiled frontend code and create the production build                             |
| `npm test`                     | Run the documented default automated suite once                                               |
| `npm run test:e2e`             | If applicable, test the documented running application mode                                   |
| `npm run release:preflight`    | Validate the release inputs and all applicable release gates                                  |
| `npm run set-version -- patch` | Prepare a reviewed version update; also accept `minor`, `major` or an explicit stable version |

A green `check` does not imply tests or a production build passed unless it actually runs them.
Do not implement placeholder commands that succeed while required work is skipped.

Pin build runtimes and formatter versions exactly in tracked configuration. Record the package
manager version and commit its lockfile. Runtime-manager files and CI values are generated from
or checked against the project's declared source. Upgrades are reviewed changes to these pins;
the baseline does not freeze every project to Quiltor's current version numbers.

Development may support a broader runtime range if documented. Release checks use exact pins.
Select Python through the project environment or a resolver that tests both version compatibility
and required imports. Verify the actual interpreter used by the operation. A bare `python` is
appropriate inside a selected environment; arbitrary PATH discovery alone is insufficient.

## 4. Complete and identifiable local startup

The launcher resolves paths from its own repository location, starts the services in dependency
order, and reports ready only when all required services are usable. Starting never implicitly
installs dependencies, builds a release or changes a version.

- Bind development services to loopback by default. Validate configured ports as integers in
  the range 1–65535. Distinct services have distinct ports.
- Resolve frontend URL, backend URL, proxy target and test target from one configuration. An
  override must reach every consumer; document any intentionally separate test server.
- Fail clearly on an occupied port. Do not silently choose the next port, terminate an unknown
  listener or mistake it for the process just launched.
- Probe application identity and readiness with a bounded deadline. A successful HTTP status
  alone is insufficient. In local development, verify a per-launch instance identity or another
  mechanism that proves the response belongs to this launch and checkout.
- Prefix logs by service and print the effective URLs, mode, version and source revision. Report
  missing tools, spawn errors, timeouts and early child exits with a nonzero result.
- Ctrl+C, startup failure and unexpected service exit clean up the launcher's own process trees.
  Use bounded graceful shutdown followed by termination of only the owned processes.
- Document backend reload behavior. After a backend change, either reload automatically or
  restart the owned server before claiming the running application includes the change.

Parallel projects and worktrees use separate port sets and isolated writable development data.
Make those settings explicit; shared default ports do not constitute worktree support. Local
checkout paths and instance identifiers stay in local diagnostics, not public metadata endpoints.

Keep development mode and production-preview mode explicit. If end-to-end tests use built assets,
build first and launch that artifact. Hot-reload or unit-test success cannot prove a packaged
frontend is fresh.

## 5. Product version and build identity

Each independently released product has one authoritative version source. For a multi-language
application, use a root `VERSION` file with `MAJOR.MINOR.PATCH`; a single-package project may use
`package.json` when its profile declares that as the source. Independently released packages may
have separate sources with explicit ownership and compatibility rules.

Use patch for compatible fixes, minor for compatible functionality, and major for incompatible
public contracts. Before 1.0, document compatibility expectations. Prereleases require an explicit
profile and parser support; do not assume a three-integer updater handles them.

All manifest copies and runtime displays derive from the authoritative source. The updater
validates the complete target set before changing files, updates it as one transaction with
rollback on failure, and rejects non-increasing stable versions. It does not commit, push, tag or
publish implicitly. Existing tags and published versions are checked again at the release gate.

For a production frontend, embed the version and source identity at build time. A diagnostic or
About view reads that bundle's metadata; it must not label an old frontend using only the current
backend version. Record at least product version, source identity and build mode in artifacts.
For untracked builds, use the source revision and mark local modifications as dirty. Use an
explicit unknown revision for source archives where Git metadata is unavailable.

For committed build output, use a deterministic source-content digest with a declared input set
that excludes generated output. Embedding the hash of the commit that contains those generated
bytes would make an identical rebuild impossible. Bind the exact release commit through packaging
metadata and the release manifest after the tracked-output freshness check, then test that final
artifact. If version changes affect committed assets, regenerate them as part of the version
update and include them in its validated transaction and rollback behavior.

Release manifests add the exact source revision, artifact digests and build-run identity. Build and test the exact revision
being released, then publish those verified artifacts without rebuilding them. Public release
versions are immutable. The profile names what triggers publication so a merge or push cannot
unexpectedly be treated as a harmless version-file update.

Generated build output is normally ignored by Git. If distribution requires committed output,
record the reason, rebuild it with source changes, and make CI reject any difference, including
new untracked build files. This is a distribution choice, not a requirement for every frontend.

## 6. Adoption and evidence

1. Inspect current configuration and local changes; fill out the project profile with verified
   commands and sources.
2. Adopt only the active language templates, merging existing settings and preserving unrelated
   scripts. Record pending command or launcher work before claiming compliance.
3. Verify formatting write/check parity on representative files and run the relevant static gates.
4. For launcher changes, check readiness, a missing dependency, an occupied port, a configured
   alternate port, early child failure and Ctrl+C cleanup. Check worktree isolation if supported.
5. For version tooling changes, verify manifest agreement, rejected downgrade, failure rollback
   and served frontend identity. Run destructive failure cases in disposable fixtures.
6. Add CI checks, record the adopted baseline version and document justified exceptions. Upgrade
   other repositories through separate reviewed changes using the same versioned baseline.

The [Quiltor reference inventory](quiltor.md) records the source project's configuration and
distinguishes inherited behavior from the improvements specified here. Its source paths refer
to Quiltor, even when this portable directory is copied elsewhere; they are not commands or
evidence for the adopting project. Keep that dated reference separate from the target project's
own `docs/PROJECT_PROFILE.md`.
