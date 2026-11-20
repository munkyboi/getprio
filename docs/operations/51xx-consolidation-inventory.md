# Active 51xx consolidation inventory

Captured 2026-11-20, read-only against active local services. This is an integration inventory, not release or deployment approval. Existing 51xx services, data and 52xx copies remain untouched.

| Surface | Active artifact | Reported identity | Root HTML SHA-256 |
| --- | --- | --- | --- |
| Marketing 5190 | `/Users/carloabella/.codex/private/social-separator-x3xfpgaa/marketing/candidate` | `05675156d35c649128ecd3ba8da6ff003a17e0d7`, with retained source and local auth UI delta | `521c58412a3213a53bda12ca915a45ea8a6f7859e549166dbe81df69f039c9fb` |
| Customer 5191 | `/Users/carloabella/.codex/private/getprio-customer-cross-tab-oauth-20261119/frontend/dist-customer` | `customer-cross-tab-oauth-20261119-lists-alias` (local build label, not a verified Git commit) | `d0a044033b0b9ba4cfaf5b98354664733c5b773db10fd543a27135af7b5f5d32` |
| Vendor 5192 | `/Users/carloabella/.codex/private/getprio-vendor-b9-ed864-canonical-20261119/dist` | `b9f05eac39f5ec60ea458a43a5fd88f3ed598fa7` plus queue-button CSS overlay | `8f0906270b0723eb15bb704f45439742dbf913b5214f1225afc76701bda6847b` |

The retained Marketing source is `/Users/carloabella/.codex/private/getprio-ui-port-fix-20261119/marketing-source`; its active UI was rebuilt with existing local origin settings. The Customer source snapshot is `/Users/carloabella/.codex/private/getprio-customer-cross-tab-oauth-20261119`. Vendor source candidate is `/Volumes/Storage0/Projects/getprio/web-app/worktrees/queue-type-model-20261026`, currently at `72c17f43bec183955098eeff45bfe99696c14368` and containing untracked dependencies/build outputs. A manifest identity alone does not prove all artifact files came from the named commit.

The current Vendor API 5091 runs a retained private copy of the queue source through `local-platform-surface-server.mjs`; Customer/auth API 5390 uses the private `getprio-facebook-error-20261118/launcher.mjs`. They are separate local runtimes. Preserve their process configuration and retained data; neither is a production deployment artifact.

## Candidate and gaps

The isolated candidate worktree starts at main `2900455ea8a81a97a6799c16e0f66fc215be0391` and includes reviewed universal-auth icon/tab, queue-border, and Marketing auth-route commits. It is a partial integration, not an exact 51xx bundle. In particular:

- The active Customer snapshot has 116 files under `frontend/src/customer` absent from main. Its surface, auth context and API client differ from main. Customer Web ownership and independent parity review are required.
- The local Customer Facebook flow explicitly checks `http://localhost:5191` and calls `http://localhost:5390`; local-only flags and endpoints must not become production assumptions. Cross-tab/session and Facebook behavior require a reviewed, compatible server contract and full testing.
- Active Vendor source and main differ in shared UI/auth/API files and backend files. Determine the effective Vendor runtime/source/build deltas and test existing queue/data semantics before integrating, instead of overwriting main or the retained local stack.
- Active local API/origin settings are loopback-specific. Production browser origins and credentials must be configured separately; the existing Marketing-specific origin policy does not admit universal auth and must not be bypassed by granting unrestricted private API access.
- Current static deployment tooling publishes one frontend root, not separately built Marketing, Customer and Vendor roots. Three-surface publishing and host routing require an independently reviewed release path, rollback and live verification.

Do not push this branch as a complete release until source provenance, Customer parity, compatible APIs, security, CI, rendered acceptance and the release gates are resolved. No deployment is performed by this inventory.
