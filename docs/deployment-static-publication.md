# Static publication during deployment

The DigitalOcean workflow builds all four static applications outside the served `dist` directories. After static builds and the backend build succeed, `scripts/static-release.mjs publish` validates the frontend, developer portal, and shadcn Platform output before changing served files. The legacy Platform application is built for compatibility checks but is not published.

Every referenced local script/link asset must exist; Platform HTML must include the exact deployment SHA. Assets are copied to temporary files beside their destination, given public read permissions, and renamed into place. All assets are published before any HTML. HTML uses the same atomic rename so a reader receives a complete old or new file. Existing hashed assets are retained for old HTML and in-flight clients. Staging/artifact symlinks and aliased served roots are rejected; existing root symlinks are resolved.

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
