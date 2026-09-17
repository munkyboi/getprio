# Developer Portal prototype decisions

Source: `frontend/src/pages/prototypes/DeveloperPortalPrototype.tsx` in the prototype worktree. That screen uses fictional data and no real mutations. This list tracks which decisions have reached the local Developer Portal.

| Prototype decision | Local implementation |
| --- | --- |
| Workspace presentation: full-width project rail, content-led headings, generous card spacing, strong primary action | Implemented in the real workspace with its live data. Headings remain capped at 42px as requested. |
| Project navigation and separate Sandbox / Production context | Implemented in the workspace. Production currently shows readiness only. |
| Sandbox setup sequence | Implemented with real key, profile, and queue state. The first ticket and mobile tester steps require their remaining services. |
| Daily Sandbox ticket allowance | Reads the project's real issued-ticket count; resets at 00:00 UTC. |
| API keys, profiles, queues, webhooks, and deliveries | Backed by project-scoped API routes. Secrets appear once. |
| Current queue tickets | Queue snapshots now feed a prototype-style ticket inspection section with queue selection, status/search filters, pagination, and expandable ticket details. Mobile account-linking state remains explicitly unavailable until that backend contract exists. |
| Queue management | Queue name, state, and ticket intake can be updated from the workspace. Queue slugs remain read-only identifiers; destructive queue deletion is not exposed. |
| Production readiness | Shows personal MFA state and the missing approval and prepaid-credit requirements. It does not grant access. |
| Test accounts and tester app | Not connected. The workspace says so rather than inventing accounts or devices. |
| Production application, project subscriptions, wallet, and billing | Not connected. No production action or balance is simulated in the real workspace. |
| Team invitations and per-member security | Not connected. Current workspace shows the signed-in account role only. |
| Account page hierarchy | Billing remains available at `/dashboard/billing`; account access is now in the authenticated header menu, with `/account/profile` providing Personal Details, Password, and Security tabs. Live session/project state is shown; unavailable billing, team, and MFA mutations remain explicitly unavailable. |
| Directory publication and moderation | Private profile creation exists; publication and review do not. |
| Detailed key rotation history and usage ledger | Basic key state and daily allowance exist; rotation overlap and per-ticket history do not. |

Do not treat the fictional prototype interactions as live behavior. Each remaining row needs a backend contract, authorization, persistence, and UI verification before it can be marked implemented.

## Visual parity guardrails

The prototype is the visual acceptance reference. Before changing a workspace page:

1. Copy the reference values for labels, casing, colors, spacing, type scale, control height, and radius into the shared workspace tokens in `DeveloperWorkspace.css`.
2. Reuse the existing card and button variants instead of adding page-specific descendant overrides. Mantine internals must inherit their parent control color; broad selectors such as `.workspace span` are prohibited.
3. Compare the same page at mobile, tablet, and desktop widths. A change is complete only when the implementation matches the reference layout and copy at each supported width.
4. Run `npm --workspace developer-portal run typecheck`, `npm --workspace developer-portal run build`, and `git diff --check` before reporting completion. Add a screenshot comparison when a visual value changes.

## Live wiring

The live workspace now uses the prototype stylesheet as its visual base (`DeveloperPortalPrototype.css`) and applies the prototype layout classes to the real workspace shell. `DeveloperWorkspace.tsx` remains the live adapter: navigation updates the dashboard URL, project resources and secrets continue to use `developerApi`, and unavailable prototype-only features remain explicit instead of using fictional mutations.

## API key parity

The live API keys flow follows the prototype’s two-screen interaction: `API keys` lists credentials and routes `Create API key` to `/dashboard/keys/new`. Key history is always rendered as the prototype-style expandable table; each expanded row uses the live scopes, status, revocation time, and project-preserved resource message.
