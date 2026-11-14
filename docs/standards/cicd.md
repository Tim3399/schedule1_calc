# CI/CD and test rules

Part of the cross-project engineering standard, baseline version **1.5.0** (see
[README.md](README.md)). Every numbered rule carries **MUST** (mandatory) or **RECOMMENDED**
(recommended). Rule numbers are stable and are cited in reports, so they are not renumbered.
Rules apply only to capabilities the project actually has. Tools that read the labels also accept
the earlier German forms `MUSS` and `EMPFOHLEN`.

Use this reference when the `cicd` scope is requested or when another changed scope requires its
automation contract to change. CI/CD configuration belongs to the adopting project: choose its
provider, protected branches, release triggers, environments, artifact formats, signing policy,
and deployment targets from product requirements and existing authorized behavior.

This standard distinguishes three capability states:

- **supported** has a real entrypoint, required inputs, meaningful validation, failure behavior,
  and current evidence;
- **scaffold** documents activation requirements but does not present a passing placeholder job;
- **inapplicable** records why the project does not need the capability.

A project with CI but no publication or deployment can adopt the CI requirements and mark the CD
components inapplicable. Do not add process or profile detail that the project does not use.

## A. Pipeline and verification (MUST)

1. **MUST. One entry point.** Each repo has exactly one verification command (for example
   `verify`, `check`, `npm test`). CI calls only that command and keeps no test or lint list of
   its own in the workflow.
2. **MUST. The entry point checks its prerequisites** (interpreter, packages, Docker, tool
   versions) and reports what is missing instead of dying with an import error.
3. **MUST. A gate counts only once it can demonstrably turn red and has run green once for real.**
   Counter-test with a deliberate violation, plus a real green run on the runner, not only
   locally. A CI that has never run is not a gate.
4. **MUST. At least one CI platform runs the complete suite without skips.** What is missing there
   (Docker, POSIX) is an infrastructure defect and is tracked as one. Every suite runs on every
   target platform, and missing artifacts (for example screenshot baselines of one platform) are
   red, not skipped. Green locally on one OS is not enough; a release once failed on a test that
   was green only on Windows. A claim of platform or path neutrality counts only with a run on
   Linux (CI run, or a cold container with the clone mounted read-only). Exception: where the CI
   has no runner for a target platform (for example no Windows runner), the project records that
   in its profile and evidences the platform per task by a local run in the report. The Linux run
   stays the evidence for neutrality.
5. **MUST. Acceptance on a fresh export.** Before each release, verification runs on `git archive`
   output or an empty runner, never in a working copy with caches. Groups do not assume artifacts
   of other groups.
6. **MUST. Pin exactly, one source per version.** Actions by full commit SHA, images by digest,
   binaries by SHA256, npm packages by exact version plus lockfile integrity. A test fails on
   `@vN` or version drift. A pinned npm wrapper that downloads its binary at runtime is pinned only
   together with that binary's version (for example `EC_VERSION` for `editorconfig-checker`).
   CI environment variables (`GITHUB_ACTIONS`, `CI`) change the output format of some tools, so
   every gate is also run locally with `GITHUB_ACTIONS=true CI=true`. A gate step with a pipe sets
   `set -o pipefail` or `shell: bash`, otherwise `cmd | tee` hides a failing gate. After an update,
   count all package pins in project scripts and workflows; pins outside the package files are not
   raised by `update`.
7. **MUST. Fix line endings.** `.gitattributes` sets `eol=lf` for everything a formatter or hash
   checks. The proof runs on a fresh CRLF checkout.

7a. **MUST. One single required check.** An aggregator job summarizes all jobs and fails closed.
"Skipped" counts as success only for a deliberate opt-out in the plan. A missing input never
silently shrinks the matrix.

7b. **MUST. Network steps have a hard deadline.** Downloads and mirrors have a timeout, and no
`|| true` swallows an error. A missing tool is a gap, not green.

7c. **MUST. Measure first, then change.** Optimizations (cache, sharding) are measured before and
after under the same conditions, alone and one after the other, and reverted when they have no
effect.

## B. Tests (MUST)

8. **MUST. Counter-test per fix.** Every bugfix and every new gate shows in its report the test
   red before and green after, both with output.
9. **MUST. Skip = error.** Skipping only through an allowlist with test name, exact message and
   reason. Critical tests never appear in it, and a test checks that. The suite reports the number
   of skips per platform.
10. **MUST. Expected values before the run.** Acceptance and parser tests have expectations fixed
    in advance and do not merely confirm their own output.
11. **MUST. Test against the real thing.** Real database with a real role, real binary, real Git
    or Compose call. Stubs only for the nondeterministic (LLM, time, network), with a written
    contract or recorded original output, never rebuilt freehand.

11a. **MUST. Mutation proof with a null case.** For new checks, show that a targeted mutation turns
them red and that the null case (no tests found, exit 0 without a run) does not pass as green.

11b. **MUST. Exact instead of substring assertions.** Tests compare whole values or word
boundaries ("Saved" is contained in "Unsaved").

11c. **MUST. The suite tests the right subject.** It makes sure exactly the built state is tested
(own server, check for build diff and stale servers), not an old build.

11d. **MUST. Measure layout only when it is stable.** UI tests wait for an event or stability,
never for a fixed time. Time budgets live in one place as a constant.

11e. **MUST. Evidence = command + result + run ID + platform.** Reports name the run ID for CI runs.

12. **MUST. No wall clock in tests.** No `sleep` as synchronization. A flake is a bug with a named
    cause and goes into a flake register with the run ID. Automatic retries are forbidden, and a
    green rerun counts as a flake, not as success.
13. **MUST. Prove protective paths.** Security tests show that the protection actually took effect
    (counter, audit line, exit code, fail closed), not only the outcome. Error messages do not
    reveal secret input.
14. **MUST. Rules as scan tests.** Project rules that concern all files of a type are tests that
    pick up new files automatically.
15. **MUST. The reviewer repeats the run.** Acceptance rests on the reviewer's own run, not on the
    implementer's report. Recurring traps are kept in `known-risks`.

## C. Release and versions (MUST)

16. **MUST. Tags only on verified commits in the release branch.** Annotated, with release notes.
    The tag sits on the merge commit of `release/<x.y.z>` in `main` (patches: in `patch/<x.y>`).
    The pipeline checks tag version = package version and that the tag commit lies in `main` or
    `patch/<x.y>`. The release notes are the section of the version in `CHANGELOG.md`
    (rule 19b).

16a. **MUST. Build once, re-check at publication.** A build workflow with preflight produces the
artifacts. A separate publish workflow does not rebuild; it checks manifest, SHA = release
commit and version monotonicity. The built SHA is the release commit, not HEAD at the time of
the run. Publishing an existing version is rejected (the registry already lists it).

16b. **MUST. A rerun is not a fix.** A release on a red matrix needs a decision entry with a
reason.

17. **MUST. Pushed tags are never moved.** A release that fails in the pipeline is replaced by the
    next patch version. Publication errors are fixed without a rebuild, with the same artifacts.
18. **MUST. Force-push and history rewrite only under protocol:** mirror repository, check script,
    rehearsal against a fake origin, lease, a second confirmation by the owner with the final
    SHAs, migration plan for all checkouts.
19. **MUST. Evidence per release as a file:** revision, image digest, run number, backup,
    acceptance checks. A release counts as deployed only when the acceptance is in the same
    record.

19a. **MUST. Raise the version only through `set-version`.** The version is raised with
`agent-team set-version <patch|minor|major|x.y.z>` or an equivalent project script, never by
hand. The script requires a clean work tree (only the changelog may differ) and a target version
strictly greater than the current version and the highest existing tag. Only stable versions (`x.y.z`) are accepted; pre-release identifiers are rejected by design. Order: write the
changelog draft, write the version files provisionally with the new version, run the
verification entry point (tests and format check) against exactly this state, roll back on red.
In short: provisionally write → verify → roll back.
On red, on an exception or on a signal during the verification, the version files are rolled
back byte for byte; only a green run keeps them and dates the draft. The script makes no
commit, no tag and no push and proposes the commit `Prepare release <name> <version>` with
`Refs: V-<version>`. The changelog draft stays after a red run so that it is adjusted and not
rewritten. At the tag, the pipeline checks monotonicity, tag = version and
`check-changelog --release <version>`.

19b. **MUST. Changelog in Keep a Changelog 1.1.2.** Every versioned unit has one `CHANGELOG.md`
in its root. Title `# Changelog`, first section `## [Unreleased]`, then `## [x.y.z] - YYYY-MM-DD`
in strictly descending order. Categories are fixed in English (`Added`, `Changed`,
`Deprecated`, `Removed`, `Fixed`, `Security`), each at most once per section, entries as a
`- ` list in the project language. At most one draft `## [x.y.z] - Draft` (an agent-team extension; the older keyword `Entwurf` is still accepted) is allowed, only
directly below `[Unreleased]`; the release check rejects a draft. Every task with a visible
change adds an entry with its task ID under `[Unreleased]`. Detailed notes under
`docs/releases/` are allowed when the changelog links them. `agent-team check-changelog`
checks the format and belongs to the verification entry point and CI.

## D. Secrets and access (MUST)

20. **MUST. No secrets in workflows, Compose files or the repo.** gitleaks runs over the whole
    history. Local settings files (`settings.local.json`) are never tracked. A missing secret is
    noticed in the run with a clear message.
21. **MUST. CI access to production only through a forced command** on a verified file outside the
    repo, with an allowlist of targets. Write access to the repo is not a right to production.

## E. Deploy and operations (MUST)

22. **MUST. Deploys take only a full commit SHA.** Images are recorded by digest, and rollback runs
    through that record, never through a tag.
23. **MUST. Migrations are rehearsed before release against a copy of real production data.**
24. **MUST. Host maintenance, image updates and code deploys are separate operations.**

## E2. Docker (MUST)

25. **MUST. Volumes are always properly named.**
    - No anonymous volumes: every volume is listed by name in the top-level `volumes:` block of the
      Compose file, never only as a path in the service. A `VOLUME` in a Dockerfile is backed in
      Compose by a named volume or a deliberately chosen bind mount.
    - One naming scheme: `<project>_<service>_<purpose>`, for example `mediagrab_db_data` or
      `quiltor_api_uploads`. The name is set explicitly with `name:` so it does not depend on the
      folder or Compose project name.
    - Bind mounts only onto documented absolute or project-relative paths.
    - Checkable as a scan test (rule 14) over all Compose files: no volume without an entry in the
      top-level block, every entry has `name:` in the scheme, and `docker volume ls` after a test
      run shows no anonymous hash volumes of the project.
    - Why: anonymous or folder-name-dependent volumes cannot be assigned reliably during backup,
      migration and rollback (rules 22, 23) and are lost on cleanup.

## E3. Code formatting (MUST)

26. **MUST. Every repo has the shared `.editorconfig` as its base**
    ([templates/formatting/.editorconfig](templates/formatting/.editorconfig)). Project-specific
    additions go below it; the base rules are not overridden.
    - Indentation is 4 spaces everywhere. Exceptions only where the tool forces it: Makefiles and
      Go (tabs).
    - Formatters follow `.editorconfig`: Biome (`indentWidth: 4`), Prettier (`tabWidth: 4`), Ruff
      (`indent-width = 4`, `line-length = 100`), rustfmt (default 4). Width 100, double quotes and
      so on as in README section 2.
    - A project without `.editorconfig` gets it from `init`; an existing one is not overwritten.
27. **MUST. The format check is a gate.** `check:format` is part of the verification entry point
    (rule 1) and of CI. It runs `editorconfig-checker` and the formatter of every active profile in
    check mode and ends with exit code other than 0 on any difference. Like every gate it is
    introduced with a counter-test (rule 3).

## F. Recommended checks, toolkit (RECOMMENDED)

Each project takes from this list what fits its stack. Whether a check is mandatory for the
project is set by the project configuration. When a check is sensible for the stack and missing,
the profile records a reason. All tools are pinned exactly (rule 6), and every new check is
introduced with a counter-test (rule 3).

28. **RECOMMENDED. Repo hygiene:** `typos` (spelling in code and docs) and Markdown lint (`rumdl`
    or `markdownlint`). `editorconfig-checker` is already part of rule 27.
29. **RECOMMENDED. Secrets:** `gitleaks` over the whole history of all refs, with an allowlist per
    finding, not per commit SHA.
30. **RECOMMENDED. Dependencies:** `osv-scanner`, plus per ecosystem `npm audit`, `govulncheck` or
    `pip-audit`. Exceptions only with an expiry date.
31. **RECOMMENDED. CI files:** `actionlint` for workflows, `shellcheck` for shell scripts, `hadolint`
    for Dockerfiles.
32. **RECOMMENDED. Python:** `ruff check`, a type checker (`pyright` or `mypy --strict`),
    `unittest` or `pytest`. (`ruff format --check` is part of rule 27.)
33. **RECOMMENDED. JavaScript/TypeScript:** `biome` or `eslint` (with `react-hooks` for React),
    `tsc --noEmit` or `--checkJs` for JSDoc-typed JS, unit tests (`vitest` or `node:test`).
34. **RECOMMENDED. Go and Rust:** Go: `golangci-lint` with a config in the repo, `go test -race`
    (Linux). Rust: `clippy`, `cargo test`. (`gofmt` and `rustfmt --check` from the pinned toolchain are part of rule 27.)
35. **RECOMMENDED. Web frontend:** Playwright E2E against the built state, accessibility with `axe`,
    visual baselines per platform with a completeness check.
36. **RECOMMENDED. Database:** integration tests with a real throwaway database and a restricted
    role, migration and upgrade tests.
37. **RECOMMENDED. Infrastructure and deploy:** contract tests on Compose and workflows, preflight
    without production change, acceptance after the deploy.
38. **RECOMMENDED. The pipeline itself:** contract tests on the workflows (matrix, path filters,
    pinned SHAs) with a mutation proof.

## G. Runtime budget of the tests (MUST as a warning)

39. **MUST (as a warning). Target: the complete verification (rule 1) runs in under 25 minutes.**
    Measured is the wall time of the required check in CI; for matrix runs, the longest path to
    the result.
40. **MUST (as a warning). Over 25 minutes is a warning, not an error.** The pipeline reports the
    overrun visibly (warning in the run, note in the report) and does not block.
41. **MUST. Justification duty.** When a run exceeds 25 minutes, the agent who owns the suite or
    introduces a change must be able to justify why no saving is possible. The justification is
    written in the report or in `decisions.md` and names:
    - the measured times per group or job (the five slowest);
    - which levers were examined and with what measured result: parallelization or sharding,
      shared seeds and fixtures, cache (measured before and after, rule 7c), waiting replaced by
      events (rule 12), split into a PR matrix and a main matrix;
    - why the remaining runtime is necessary (for example a real stack for E2E, baselines per
      platform).
42. **MUST. No shortcut at the expense of the result.** Time is not saved through skips, a smaller
    matrix or dropped gates (rules 4, 7a, 9). A shortened PR matrix is allowed when the full
    matrix runs before merge or release.

## G2. Branch convention (MUST)

43. **MUST. Branch names follow this table.** Every branch has a purpose, a creator, a base and a
    target.

    | Branch                  | Purpose                                                          | Created by    | Base                                   | Target                                                      |
    | ----------------------- | ---------------------------------------------------------------- | ------------- | -------------------------------------- | ----------------------------------------------------------- |
    | `main`                  | the only main line, named the same locally and remotely          | –             | –                                      | –                                                           |
    | `task/<task-id>-<slug>` | one task (every class, also S), integration branch               | implementer   | `main`                                 | merge `--no-ff` into `main` by the orchestrator             |
    | `dev/<part-id>-<slug>`  | one part of a task, by a dev or a subagent                       | dev, subagent | its `task/` branch                     | merge into its `task/` branch                               |
    | `release/<x.y.z>`       | release preparation: `set-version`, changelog, last fixes        | implementer   | `main` (minor, major) or `patch/<x.y>` | merge into `main` or `patch/<x.y>`, tag on the merge commit |
    | `patch/<x.y>`           | maintenance line for patches of a published minor                | orchestrator  | tag `<x.y>.0`                          | stays; fixes are brought back to `main`                     |
    | `kb`                    | knowledge-base repository                                        | init          | –                                      | –                                                           |
    | `wt/<role>`             | resting branch of a role worktree (instead of `worktree-<role>`) | bootstrap     | `main`                                 | never merged                                                |

44. **MUST. Slug rule.** The slug uses lowercase `a-z0-9-`, at most 40 characters, and names the
    goal. Examples: `task/T-55-b825-rollout`, `dev/D-55-1-format-commit`, `release/0.4.0`.
45. **MUST. No direct commit on `main`.** Only the orchestrator's merges are allowed. A task has
    exactly one `task/` branch.
46. **MUST. A release always runs through `release/<x.y.z>`** and is merged into `main` (patch
    releases: into `patch/<x.y>`). The tag sits on the merge commit.
47. **MUST. Merged branches are deleted.** Merged `task/`, `dev/` and `release/` branches are
    deleted locally at once, and remotely only with the user's approval.
48. **MUST. Subagents rename their branch at once.** The automatic `worktree-agent-<hash>` becomes
    `dev/<part-id>-<slug>` (`git branch -m`).
49. **MUST. Forbidden prefixes:** `codex/`, `claude/`, `feature/`, `int/`, `worktree-`. A tool that
    creates such a branch renames it before anything is pushed. The legacy branches
    `release/0.1.x` and `release/0.2.x` stay as history.
50. **MUST. Enforcement.** A PreToolUse hook checks the name at `git checkout -b`, `git switch -c`,
    `git branch <name>`, `git branch -m` and `git worktree add -b` and blocks a deviation with a
    hint. `agent-team check-branch` checks the current branch and runs in CI (on
    `GITHUB_HEAD_REF` or `GITHUB_REF_NAME`; tag runs pass). Like every gate it is introduced with
    a counter-test (rule 3).

## H. Delivery contract detail (MUST)

The following sections detail rules 1 to 27 for CI and delivery. Where a numbered rule and this
text overlap, the numbered rule is the short form and this text the full contract. Each section
is mandatory; headings carry the label.

### Continuous integration contract (MUST)

#### Triggers and required results

Run the relevant CI contract for pull requests and for each protected or integration branch that
accepts changes. Account for provider-specific merge queues or synthetic merge revisions where the
project uses them. Define the source revision that each event validates.

Required checks must cover the project's owned local command contract with the same committed
dependency locks and compatible exact tool pins. Record the local equivalent of every required
check. A provider wrapper may partition or parallelize the work, but must not silently change its
meaning. Keep platform-specific coverage where the product's supported behavior depends on it.

Expose stable aggregate results when matrices, shards, or internal job names can change. The
aggregate fails if any required dependency failed, was cancelled, or did not run as required. Make
required-check names unique and stable. Do not make a path-filtered or conditionally absent workflow
the only producer of a required result; either run a small always-reporting aggregate or structure
the trigger so the required result is always concluded. A skipped capability is not evidence that
its validation passed.

Every required check performs meaningful, nonempty validation. Reject empty test discovery,
unrecognized suites, stale generated output, missing expected artifacts, and other cases in which a
green command would cover nothing. A placeholder passing job records no progress and is prohibited.

Set finite job or step timeouts appropriate to the work. Report enough diagnostics to distinguish
test failure, setup failure, timeout, cancellation, and missing coverage without exposing secrets.

#### Reproducible inputs and security boundary

Use committed dependency locks and project-approved runtime, build, formatter, and packaging pins.
Pin reusable third-party automation to an immutable, verified revision where the provider supports
it. Record the reviewed upstream version beside an opaque pin when that aids maintenance. Review pin
updates as supply-chain changes.

Declare least privilege at the workflow level and grant narrower job-specific permissions only
where needed. Ordinary validation should have read-only repository access. Treat pull requests from
untrusted contributors, dependency-controlled build hooks, generated scripts, and reusable
automation as executable code. Never expose release, deployment, signing, or long-lived credentials
to untrusted pull-request code. Keep validation that handles untrusted code outside privileged
events, runners, environments, and workspaces.

Use short-lived, audience-scoped identity federation where the provider and deployment target
support it. Otherwise scope and rotate stored credentials according to project policy. Record secret
names and consumers, never secret values, in the project profile.

#### Caches, artifacts, and concurrency

Caches may improve speed but are never test or release evidence. Key them from the relevant locks,
toolchain, platform, and other inputs; tolerate a cold or rejected cache; and avoid crossing trust
boundaries with writable caches. A cache hit must not decide that a required check passed.

Artifacts that cross jobs or workflows have explicit names, retention, producer identity, source
revision, and cryptographic digests. Fail closed on a missing artifact or digest mismatch. Treat a
provider's warning-only digest check as insufficient for a release hand-off: the project must make a
mismatch fail publication or deployment. Diagnostic artifacts may be best-effort, but release
artifacts are required and immutable.

Cancel superseded pull-request validation when doing so saves resources without hiding the newest
result. Include workflow identity and source ref in concurrency groups so unrelated workflows or
branches do not cancel each other. Serialize publication, promotion, and deployment for each target
or environment; do not cancel an in-progress state-changing operation unless the project's recovery
design explicitly proves that safe.
Define whether queued deliveries may be superseded or every tagged version must be processed.
Handle queue limits and retries explicitly; serialization alone does not guarantee delivery of
every event or version order. Reject stale promotion to a current channel unless it is an
explicitly authorized rollback under the project's policy.

### Continuous delivery contract (MUST)

#### Separate build evidence from state changes

Separate verification and artifact construction from publication, promotion, and deployment. A
delivery operation consumes a successful build for one exact source revision. It verifies the build
producer, revision, conclusion, selected artifact set, manifest, and digests before receiving or
using privileged credentials.

Build once and reuse those exact digest-bound artifacts through later stages. Do not rebuild during
publication, promotion, or deployment. A release manifest records at least the source revision,
artifact identities, artifact digests, build-run identity, and any required signature or provenance
records. Container or package promotion resolves an immutable digest, not a mutable tag or filename
pattern alone.

Choose and record the authorized trigger and source-ref policy for each state-changing stage. For a
new stable-release configuration, default to a product-version tag whose pattern is a project
choice. Resolve the tag to one exact revision, require its version to match the authoritative
product version, and bind all release gates to that same revision. Run source-level gates before
packaging and validate the resulting artifacts before promotion or publication. The tag selects
a candidate; it is not validation by itself. Record prerelease and
moving-channel policy explicitly.

Preserve an existing authorized branch-based or automatic release scheme as a project decision
unless its migration is requested. Report a mismatch with the new-project tagged-release default as
a deviation or conflict rather than silently changing it. A manual recovery path must authenticate
and validate the same build contract; manual invocation does not make an arbitrary revision or
artifact trustworthy.

#### Environments, secrets, and fail-closed gates

Declare each publication or deployment target, environment controls, credential consumer,
permission set, signing requirement, and approval policy as project decisions. Acquire secrets only
after untrusted code and build inputs have been validated. Do not run untrusted pull-request code in
a job that can reach a release environment, privileged runner, signing identity, or deployment
secret.

Fail closed when a required test, artifact, manifest field, digest, signature, notarization,
attestation, or environment gate is missing or mismatched. A supported signed target has no unsigned
release fallback. Scaffold targets remain disabled until their real artifact build, verification,
credentials, and installation or deployment checks exist.

Published stable versions and immutable artifact identities are never overwritten. Promotion of a
mutable channel or environment remains bound to the verified digest. Define rollback or recovery
within the product's policy: identify the last known-good immutable artifact, authorization needed,
state/data compatibility checks, and how operators verify recovery. Recovery must not rewrite an
existing version to different bytes.

### Apply and verify the scope (MUST)

In **Start**, implement only CI/CD capabilities the project can actually run. If its provider,
remote repository, delivery target, credentials, or policy is unknown, record the component as
pending with a concrete decision or activation step. Do not invent provider configuration or a
passing stub.

In **Check**, inspect configuration and provider state only through authorized read-only operations.
Do not dispatch, rerun, approve, publish, promote, deploy, change branch protection, or edit remote
settings. Static parsing can establish declared syntax or structure; it cannot prove that a workflow
runs successfully, that secrets or environments are configured, or that branch protection requires
the intended checks. Report those claims as unverified unless direct read-only evidence supports
them.

In **Update**, preserve compatible local workflow behavior and existing authorized triggers. Change
only the requested CI/CD components. Implement dependent command-contract changes only when the
requested scope authorizes them; otherwise record the dependency as a pending prerequisite. Validate
actual activated workflows when authorized; keep provider-side changes pending when access or
authorization is absent.

For Start and Update, verify changed configuration with the provider's supported local/static
validator where available, exercise repository-owned contract scripts, and run the relevant local
commands. Do not claim a successful hosted run without one. Do not trigger remote workflows or make
remote settings changes solely to validate a local standards update.

### GitHub Actions notes (MUST when GitHub Actions is the chosen provider)

These notes apply only when GitHub Actions is the chosen provider:

- Pin third-party actions to a verified full-length commit SHA. GitHub documents this as the only
  immutable way to reference an action release; repository or organization policy can enforce it.
  See [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use).
- Build concurrency groups from workflow identity and source ref for superseded CI. Use a separate
  environment or release group without in-progress cancellation for state-changing work. See
  [Control workflow concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency).
  The default replaces an older pending run even without cancelling the running one. Where
  supported, `queue: max` retains multiple pending runs up to the provider limit; it still needs
  overflow/retry handling and must not be combined with `cancel-in-progress: true`.
- `upload-artifact` reports a SHA-256 digest and `download-artifact` validates it, but GitHub reports
  a mismatch as a warning. Add an explicit fail-closed manifest/digest check for delivery. See
  [Store and share data with workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data#validating-artifacts).
- A workflow skipped by path, branch, or commit-message filtering can leave its associated required
  check pending. Required check names also need to remain unambiguous across workflows. See
  [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

### Gitea Actions notes (MUST when Gitea Actions is the chosen provider)

These notes apply only when Gitea Actions is the chosen provider:

- `runs-on: ubuntu-latest` is a label of your own runner, defined by the runner administrator. Check
  the labels of the runner, not GitHub's image list.
- Gitea ignores problem matchers and error annotations, but it still sets `GITHUB_ACTIONS`, so tools
  still change their output format (rule 6). Pin the output format of such tools explicitly.
- `jobs.<id>.environment` is ignored, so there is no environment protection. `concurrency.queue: max`
  and OIDC identity federation (`id-token`) are not available. Behavior of `upload-artifact` and
  `download-artifact` v4 and later is unverified on Gitea; do not rely on it for release hand-offs.
- Actions without a host in `uses:` are downloaded from github.com unless the instance sets
  `DEFAULT_ACTIONS_URL`. Pin them by commit SHA as well (rule 6).
