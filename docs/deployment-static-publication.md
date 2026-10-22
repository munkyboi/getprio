# Static publication during deployment

The DigitalOcean workflow builds all four static applications outside the served `dist` directories. After static builds and the backend build succeed, `scripts/static-release.mjs publish` validates the frontend, developer portal, and shadcn Platform output before changing served files. The legacy Platform application is built for compatibility checks but is not published.

Every referenced local script/link asset must exist; Platform HTML must include the exact deployment SHA. Assets are copied to temporary files beside their destination, preserving validated public read permissions, and renamed into place. All assets are published before any HTML. HTML uses the same atomic rename so a reader receives a complete old or new file. Existing hashed assets are retained for old HTML and in-flight clients. The workflow uses `umask 022` for public build artifacts; the temporary staging root remains private. Publication rejects artifacts with group/other write permissions or without public read permission, and verifies served directories, including existing directories on retry without widening permissions. Staging/artifact symlinks and aliased served roots are rejected; existing root symlinks are resolved.

Build or validation failure leaves served files unchanged. Asset-copy failure can leave additional assets, while existing HTML remains intact. Publication is atomic per file, not a transaction across sites: a later HTML failure can leave a mixture of complete site revisions. Unhashed assets can change before HTML. This does not provide backend zero downtime or reverse applied database migrations. Asset pruning is intentionally outside this change and needs a separate retention policy.

## Observed incident on 2026-10-14

Automatic deployment [38529362865](https://github.com/munkyboi/getprio/actions/runs/38529362865) targeted `41762a8681990c38d45a583efa9884f77e246041` and completed successfully.

| UTC | Evidence |
| --- | --- |
| 07:46:47.645 | Frontend Vite build started |
| 07:50:22.989 | Independent root GET returned nginx 1.24 HTTP 403 |
| 07:50:58.236 | Frontend `index.html` emitted |
| 07:53:14.055 | Shadcn Platform `index.html` emitted |
| 07:53:49.678 | Authenticated deployment smoke completed |
| 07:53:59.229 | Independent root GET returned HTTP 200 |
| 07:54:32–07:55:27 | Six independent samples: root, referenced assets, Platform, and API returned HTTP 200 |

A local reproduction with installed Vite 7.3.6 confirmed that in-place output preparation removes prior HTML and assets before new files are emitted. This is a plausible availability mechanism matching the observed build interval. No contemporaneous nginx error log or host filesystem snapshot was captured, so the precise cause of the 403 and exact outage duration remain unproven. Vite documents its [output-directory clearing behavior](https://vite.dev/config/build-options.html#build-emptyoutdir).

## Verification

`node --test scripts/static-release.test.cjs` exercises real Vite builds, late build failure, invalid or incomplete output, publication failure, symlink boundaries, and concurrent loopback HTTP readers. Readers must receive complete HTML and successful referenced assets throughout publication. CI runs this alongside existing deployment workflow and smoke contracts.

After an approved merge and automatic deployment, verify the actual logged deployment SHA, API health and authenticated smoke, Platform revision marker, and repeated root/asset HTTP samples throughout the build and publication interval. Local tests establish publication behavior; they do not prove the next production rollout.

## Delayed CI completion

On 2026-10-14, deployment `38539353435` published `1f0f2ff9` successfully using private staging. The older #439 CI completed later and queued `38539463496`, whose actual target was `695a6640` despite workflow metadata showing the newer main revision. It checked out the older target and failed with `MODULE_NOT_FOUND` because that commit predates the publication helper. It did not publish or restart the API; independent live checks remained on `1f0f2ff9`.

Automatic deployment now requires the successful CI revision to match the workflow's default-branch revision. Delayed CI for an older main commit is skipped before the production job runs. Manual dispatch retains its existing authorization path, but every target must contain the publication helper before the server checkout changes. The guard does not alter a previously failed checkout or perform a recovery deployment. A commit can still become stale after its deployment event is created; this change covers delayed CI events and missing helper compatibility, not a general monotonic deployment guarantee.

GitHub documents the default-branch revision used for [workflow_run events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run). The tests evaluate the actual workflow expression with current, stale, missing, fork, PR, and manual event metadata, and execute the actual helper guard against disposable Git history to prove that an unsupported target cannot change the checkout.
