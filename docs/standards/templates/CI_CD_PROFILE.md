# CI/CD profile

Use this optional component beside the project profile when the `cicd` scope is active and the
project benefits from the detail. Replace fill-ins with verified project facts. Remove inapplicable
CD sections for a CI-only project. A pending value is not a completed gate.

## Adoption and provider

| Field                           | Value                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| CI/CD scope status              | Unknown / pending / partial / adopted / excepted / conflicted / inapplicable / unchanged |
| Adopted and target baseline     | To be filled in independently                                                            |
| Provider and repository context | To be filled in                                                                          |
| Configuration entrypoints       | To be filled in                                                                          |
| Protected or integration refs   | To be filled in                                                                          |
| Provider-side settings evidence | Verified source and date, or unverified                                                  |

## Continuous integration

List only activated checks. Each required result must run for every relevant change, perform
nonempty validation, and map to an owned local command using the same locks and compatible pins.

| Trigger / source revision | Required result | Local equivalent | Platforms / timeout | Evidence / status |
| ------------------------- | --------------- | ---------------- | ------------------- | ----------------- |
| To be filled in           | To be filled in | To be filled in  | To be filled in     | To be filled in   |

Record merge-queue handling if applicable, the stable aggregate check design, path/condition
behavior, empty-suite failure, diagnostics, cache keys, cold-cache behavior, and immutable verified
automation pins.

For delivery, record whether queued releases can be superseded, queue-limit/retry handling, and
how stale promotion to a current channel is rejected outside the explicit rollback policy.

## Trust, permissions, and concurrency

| Component                        | Decision                                                  |
| -------------------------------- | --------------------------------------------------------- |
| Untrusted contribution boundary  | Events, runners, code and data treated as untrusted       |
| Default and elevated permissions | Exact read/write capabilities and job consumers           |
| Secret or identity names         | Names and consumers only; never values                    |
| Environments and approvals       | To be filled in or inapplicable                           |
| CI concurrency                   | Group key and superseded-run cancellation policy          |
| Publish/deploy concurrency       | Serialized group per target; cancellation/recovery policy |

## Artifact hand-off

| Artifact group  | Producer and exact source ref | Manifest / digest | Consumer and retention | Status          |
| --------------- | ----------------------------- | ----------------- | ---------------------- | --------------- |
| To be filled in | To be filled in               | To be filled in   | To be filled in        | To be filled in |

State how missing artifacts and digest mismatches fail. Caches do not belong in this evidence table.

## Publication and deployment

Keep only supported or explicitly scaffolded capabilities. A scaffold names concrete activation
gates and does not have a passing placeholder job.

| Stage / target  | Trigger and source-ref policy | Environment / permissions / secrets | Signing or gate | Artifact promotion / deploy behavior |
| --------------- | ----------------------------- | ----------------------------------- | --------------- | ------------------------------------ |
| To be filled in | To be filled in               | To be filled in                     | To be filled in | To be filled in                      |

Record how publish, promote, and deploy reuse the verified digest-bound artifact without rebuilding;
how stable versions avoid overwrite; and how manifest, signature, test, and environment failures
stop the operation. For a new stable-release configuration, record the version-tag pattern, exact
revision resolution, authoritative-version match, same-revision release gates, and prerelease or
moving-channel policy. Preserve and identify an existing authorized non-tag trigger unless migration
is explicitly requested.

## Rollback and recovery

| Target          | Last-known-good identity     | Authorization and compatibility checks | Recovery command/runbook | Verification    |
| --------------- | ---------------------------- | -------------------------------------- | ------------------------ | --------------- |
| To be filled in | Immutable version and digest | To be filled in                        | To be filled in          | To be filled in |

## Verification history

Append evidence; do not rewrite older entries to imply that later settings or workflows passed.
Static configuration validation does not prove a hosted run or remote protection setting.

| Date | Mode and changed component | Exact revision  | Checks actually run | Provider evidence | Result / pending work |
| ---- | -------------------------- | --------------- | ------------------- | ----------------- | --------------------- |
| TBD  | To be filled in            | To be filled in | To be filled in     | To be filled in   | To be filled in       |
