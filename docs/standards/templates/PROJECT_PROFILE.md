# Project engineering profile

Copy this file to `docs/PROJECT_PROFILE.md`. Replace the fill-in values with verified project
facts; remove this paragraph when adoption is complete. A pending value is not a completed gate.

## Adoption

| Field                       | Value                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| Project/product             | To be filled in                                                    |
| Baseline                    | Cross-project engineering standard 1.0.0                           |
| Baseline location           | `docs/standards/README.md` or immutable shared-repository revision |
| Status                      | Pending / partial / adopted, with evidence below                   |
| Active profiles             | Web / Python / Rust / other, only where present                    |
| Supported developer systems | To be filled in                                                    |

## Formatting and toolchains

Record authoritative config paths, exact formatter versions, excluded/generated files and
any extra file types. Every active profile must appear in both formatting and formatting checks.

| Item                         | Source/configuration              | Value or policy                                         |
| ---------------------------- | --------------------------------- | ------------------------------------------------------- |
| Runtime/build pins           | To be filled in                   | Exact versions; distinguish supported development range |
| Package manager and lockfile | To be filled in                   | To be filled in                                         |
| Formatter owners             | To be filled in                   | To be filled in                                         |
| Editor and Git whitespace    | `.editorconfig`, `.gitattributes` | To be filled in                                         |
| Pin consistency gate         | To be filled in                   | CI command checking duplicated runtime pins             |

## Command map

Replace with actual working commands. Mark inapplicable capabilities with their reason; mark
missing required commands as pending. Note which suites are outside the aggregate checks.

| Operation                 | Command         | Scope/prerequisites                                        |
| ------------------------- | --------------- | ---------------------------------------------------------- |
| Install                   | To be filled in | Locked dependency install                                  |
| Doctor                    | To be filled in | To be filled in                                            |
| Complete local start      | To be filled in | To be filled in                                            |
| Frontend-only development | To be filled in | To be filled in                                            |
| Format / check format     | To be filled in | All active language profiles                               |
| Static checks             | To be filled in | List included gates                                        |
| Production build          | To be filled in | To be filled in                                            |
| Unit / backend tests      | To be filled in | Separate commands if necessary                             |
| End-to-end tests          | To be filled in | Built assets or source server, server ownership, test data |
| Release preflight         | To be filled in | To be filled in                                            |
| Version update            | To be filled in | Source and updated manifests                               |

## Local runtime

| Service             | Bind address/default port | Override/config source | Readiness and identity |
| ------------------- | ------------------------- | ---------------------- | ---------------------- |
| Frontend            | To be filled in           | To be filled in        | To be filled in        |
| Backend, if present | To be filled in           | To be filled in        | To be filled in        |

Document proxy configuration, startup deadline, owned-process cleanup, backend reload, dev-data
paths and isolation for parallel projects/worktrees. Include one complete alternate-port example
for a supported shell. Distinguish production-preview and development URLs.

## Version and release

Record the authoritative product version source, synchronized manifests, version command
transaction behavior, version compatibility policy and frontend build metadata. State whether
build output is tracked and why, where freshness is checked, the exact publication trigger and
how verified artifacts are reused without rebuilding.

## Exceptions and pending work

| Requirement     | Actual behavior/status | Reason          | Follow-up/review condition |
| --------------- | ---------------------- | --------------- | -------------------------- |
| To be filled in | To be filled in        | To be filled in | To be filled in            |

## Verification

Record date, baseline revision, checks performed and results. For partial adoption, identify
which requirements remain unverified. Keep evidence specific to this project and change.
