# CI/CD profile

CI/CD target: shared baseline **1.3.0**, with the immutable scoped snapshot at
[standards/cicd/1.3.0.md](standards/cicd/1.3.0.md). Other project standards retain
their adopted baseline **1.0.0**. The test-runner change is the explicitly included
tooling dependency; existing local runtime, version-update and formatter contracts
remain in [PROJECT_PROFILE.md](PROJECT_PROFILE.md).

Scope status: **partial; CI and artifacts verified, publication pending**. GitHub
[run 34475505106](https://github.com/Tim3399/schedule1_calc/actions/runs/34475505106)
passed all 42 tests on each platform, both packaged application smokes and the
aggregate gate for commit `92c8a8d11ba8036c36e0318e9850073ba105a030`.
Branch protection was enabled and read back on 2026-09-10. A passing CI run does
not prove a completed production publication.

## Continuous integration

Provider: GitHub Actions, repository `Tim3399/schedule1_calc`.
[Project checks](../.github/workflows/check.yml) runs for branch pushes, pull requests,
manual CI requests and reusable calls from the tagged release workflow.

| Gate                 | Local equivalent                                                                                         | Limit / supported platform                     |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Checks               | `python -B tools/project.py check` and `python -B tools/project.py test`                                 | 15 minutes each; Ubuntu 24.04 and Windows 2025 |
| Source and container | Docker build, `tools/container_smoke.py`, `tools/release.py build` and `verify`, `tools/source_smoke.py` | 25 minutes; Linux/amd64 container              |
| Project checks       | Both preceding job results must be `success`                                                             | Stable aggregate; two minutes                  |

The test command discovers once and fails when no tests are found. Failed tests and
discovery import errors remain failures. Both matrix platforms complete independently.
The aggregate runs even after failures and rejects skipped or cancelled dependencies.
No path-filtered workflow can leave its required result permanently pending.

`main` requires **Project checks**, bound to the GitHub Actions application, and
an up-to-date branch before merging. These rules apply to administrators as well.
Force pushes and deletion of `main` are disabled. No additional review-count
requirement is configured.

The shared setup action uses the existing exact Python/Node/npm and dependency pins.
Every external action is pinned to a verified commit; checkout/setup-node and
artifact upload/download use Node.js 24 actions. npm caches accelerate installation
but do not replace tests. Superseded branch/PR CI can be cancelled; tag builds are
retained. Python bytecode and generated artifacts are excluded from source control.

## Source and container artifacts

The source ZIP is an archive of the exact committed Git tree, under
`schedule1_calc-VERSION/`. Untracked files, local secrets and dependency caches are
not added. CI extracts and starts this archive, then checks the rendered calculator,
a successful calculation and an invalid-product JSON response.

The container supports **Linux/amd64**. Its Python 3.12.14 base is pinned by manifest
digest. `requirements-container.txt` declares direct production dependencies;
`requirements-release.lock` fixes the entire eight-package wheel graph with SHA-256
hashes for this platform. Review both together and verify the hashes against PyPI
when deliberately updating this graph. Existing development requirements stay separate.
Waitress 3.0.2 serves the application on port 8080 as UID/GID 10001. The image records
OCI version, source revision and repository labels and validates the copied `VERSION`.

Example for an already published version, preferably using its receipt's digest:

```text
docker run --rm -p 127.0.0.1:8080:8080 ghcr.io/tim3399/schedule1_calc:vVERSION
```

No external database is required for the calculator. This profile adds no hosting
service or automatic deployment. GHCR visibility is an owner-controlled setting;
a private image requires an appropriately scoped `docker login ghcr.io`.

The manifest binds product version, exact source SHA, original build run/attempt,
Linux/amd64 image ID and the size/digest of the source ZIP and saved image archive.
Verification rejects missing or additional files, metadata drift and changed bytes.
Candidate artifacts are retained by Actions for 14 days; retention is not a permanent
release store. The publishing job receives the original artifact name and build
run identity through reusable-workflow outputs, including on a failed-job rerun.

## Tagged publication

[Tagged release](../.github/workflows/release.yml) accepts pushes of `v*` tags and
requires canonical `vMAJOR.MINOR.PATCH` matching `VERSION` and all package copies.
The tag must resolve to the checked-out commit, whose ancestry must be on `origin/main`.
Prereleases, moving image channels and overwritten public versions are not supported.

Every release runs the full two-platform and artifact gates for that exact commit.
Only then may the publishing job use `contents: write` and `packages: write`.
Ordinary CI has `contents: read`; checkout does not retain credentials. The sole
publishing secret is the job's GitHub token, exposed as `GH_TOKEN` and passed to
Docker login on stdin. Untrusted PR execution cannot reach this publishing job.

Publication verifies the manifest and image identity, proves the version is absent
from GitHub Releases and GHCR, creates a draft release, pushes the already built
image to `ghcr.io/tim3399/schedule1_calc:vVERSION`, and publishes the ZIP, manifest
and publication receipt. The receipt contains the immutable registry digest.
There is no rebuild during publication and no application deployment.

Publication is serialized across versions and never cancels an active publisher.
Queued release retention uses `queue: max`; queue overflow still requires an owner
to inspect the missed run and retry it. The default `latest` channel is not moved.
GHCR has no atomic create-only push, so owners must also avoid competing manual
writes to version tags; absence is checked again immediately before the push.

## Recovery and evidence

A failure after the draft reservation retains the draft and any already pushed
image for inspection. Automatic reruns reject an existing release or image version.
Inspect the draft assets, retained Actions manifest and exact registry digest before
deciding whether to complete that draft or prepare a new version. Never delete or
overwrite a published version to make a failed run green. Recovery after partial
publication is an explicit owner operation, not an automatic destructive rollback.

A deployment rollback is outside this repository's scope. Consumers can select a
previous verified image digest; operators remain responsible for any external data
compatibility. The calculator has no required persistent database migration here.

Declared exceptions and remaining evidence:

- The selected historical source returns JSON HTTP 500 for an invalid product.
  Smoke also accepts corrected 400/422 behavior, so it does not require retaining
  that defect. Application validation changes are a separate task.
- There is no complete game-model, browser automation or type-checking claim.
  The added HTTP smoke proves only the representative packaged behavior it executes.
- Container signing is not currently required by this project's distribution policy;
  digests and trusted producer identity are verified. Introducing signing is a
  separate profile change and must not gain an unsigned fallback.
- Remote branch protection was enabled and verified on 2026-09-10 as described
  above. No version tag or production publication was created for the CI migration.
- Local actionlint 1.7.12 does not yet recognize GitHub's documented `queue` key.
  Validation suppresses only that exact unsupported-key diagnostic; hosted execution
  and the official concurrency documentation are separate evidence.
- The current branch is based on GitHub commit `f618c151`; newer application changes
  in another checkout are intentionally outside this CI/CD migration.

Record completed local checks and the exact hosted revision/run in the migration
report. Do not rewrite the historical project verification entries to imply that
these release capabilities existed previously.
