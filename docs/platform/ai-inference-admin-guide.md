# AI Inference — Platform Admin guide

Implementation reference: AI-controls usability follow-up, 13 October 2026. This guide describes the UI, not a live operational-status report.

## What this page manages

Open the **Platform dashboard → AI Inference** sidebar item (`/ai-inference`). Use this page to review inference readiness and save the requested global policy and pilot locations.

**The current implementation does not run customer-facing AI predictions.** Saving **Private shadow** records a request; effective inference remains **Off** because the runtime caller, ready resource producer and private-shadow approval are not connected. Customer wait estimates continue using their existing path.

The displayed predictor is the deterministic `resource-service-start-shadow-v1` candidate. Its target is **time to actual service start**. It is not a connected DigitalOcean AI endpoint, remote language model or learned serving model. Time until a ticket is called is a different prediction target.

## Access

- Sign in as a Platform Admin with access to the live Platform API.
- Viewing requires `platform.ai_inference.read`; changing policy requires `platform.ai_inference.manage`. The server enforces these permissions.
- A read-only user can inspect state but cannot save changes. Other roles do not receive these capabilities through this feature.
- Saving requires an active session, MFA enrollment, and primary sign-in and MFA verification within the preceding **10 minutes**.
- Fixture mode displays **Live policy required** and cannot change inference policy.

## Reading Current inference state

| Display | Meaning |
| --- | --- |
| **Requested mode** | The global setting saved by an administrator. It may differ from actual operation. |
| **Effective mode** | What the server currently permits. Today this is **Off**, even when Private shadow is requested. |
| **Customer estimates** | These controls leave the existing customer estimate path unchanged; there is no customer-delivery mode. |
| **Predictor / policy revision** | Under **Advanced diagnostics**: candidate version, kind, target and saved revision. Their presence does not mean inference is running. |
| **Readiness** | Server-owned integration and approval status. Administrators cannot override blockers here. |

Readiness blockers explain the cause and next action in plain language. Raw codes stay under **Advanced diagnostics**. An unknown code is explicitly treated as an additional prerequisite needing engineering review, not as evidence of readiness:

| Blocker | Meaning and next action |
| --- | --- |
| **caller not integrated** | The application does not invoke this resource inference boundary. Engineering integration is required. |
| **producer not ready** | A complete, coherent resource-state snapshot is not available through the approved producer. Engineering must establish inventory, lifecycle and reconciliation readiness. |
| **shadow approval missing** | Private shadow use has not been approved through the implementation process. Selecting a mode does not grant approval. |
| **customer rollout not approved** | Customer estimate delivery has not been approved. Evaluation and rollout approval remain separate work. |

**Refresh policy** reloads saved server state without saving or starting inference. It is disabled while a draft/audit reason or bound review is pending. Save first, or cancel the review and choose **Discard draft** before refreshing. A revision conflict preserves the draft and audit reason instead of silently refreshing over them; inspect the saved policy before reapplying intended changes. Discard is local only and never changes the saved policy.

Timeout and snapshot age are grouped under **Advanced settings**, collapsed by default. Both disclosures are keyboard-accessible. Read-only viewers may search and inspect pilot locations but cannot change modes, add/remove pilots, edit advanced settings or submit a review. Selected locations cannot be added twice, and the 100-location limit and bounded search results are explained explicitly.

## Requested policy controls

Defaults below describe a newly initialized policy, not a guarantee of the current saved settings. Read the page to see the actual values.

| Control | Allowed values / initial default | Effect |
| --- | --- | --- |
| **Global mode** | Off or Private shadow; initially **Off** | Off overrides every pilot. Private shadow requests private operation for selected locations once the server gates are satisfied. Neither option enables customer estimates. |
| **Timeout (ms)** | Integer **1–1,000**; initially **100** | Stores the inference time budget for future integration. Late synchronous results are discarded by the inference wrapper; this is not a hard CPU execution deadline. |
| **Maximum snapshot age (ms)** | Integer **1–5,000**; initially **1,000** | Stores how old a resource snapshot may be. Future result acceptance must recheck freshness; increasing this value does not make incomplete inventory valid. |
| **Find pilot locations** | Search text up to **100 characters** | Searches tenant/vendor business names or location names. **Search locations** returns at most 50 matches; refine the search if needed. |
| **Add pilot location** | Up to **100 distinct tenant/location pairs** | Adds an exact branch to the draft, initially requesting Private shadow for that branch. Other branches of the same vendor are not included automatically. |
| Pilot **Off / Private shadow** | Per selected location | Requests that branch's mode. A pilot set to Off remains excluded even when the global request is Private shadow. |
| Pilot **Effective** | Read-only saved server state | Displays the branch's effective mode. Changing draft controls does not update this value until policy is saved; readiness can still keep it Off. |
| **Remove location …** | Selected pilot | Removes that branch from the draft policy. The removal takes effect after saving. |
| **Audit reason** | **8–500 characters**, after server normalization | Records why the change is needed. Do not enter customer details, credentials or secrets. |

With no pilot locations selected, inference is disabled for every location. The server rejects duplicate, unknown or mismatched tenant/location pairs.

### Example: request a private pilot

1. Open **AI Inference** and read the current state and blockers.
2. Choose **Private shadow** under **Global mode**.
3. Search for the intended vendor or branch, then choose the exact location under **Add pilot location**.
4. Keep that pilot's requested mode at **Private shadow**. Leave other branches excluded or Off.
5. Keep the approved time budget and snapshot age; changing them is a policy decision, not an accuracy improvement.
6. Enter an audit reason, such as: `Prepare approved private pilot for the main branch; customer estimates remain unchanged.`
7. Select **Review policy**, inspect the normalized settings, then select **Save policy**.
8. Check the saved requested mode, revision and effective mode. In the current implementation, effective mode will still be **Off**.

This workflow saves configuration only. It does not bypass approval, enable resource tracking, create a provider connection or start resource observation capture.

## Review and save

**Review policy** requests a server-normalized preview tied to the current policy revision, reason and security confirmation. The **Confirm policy change** card shows the global mode, pilot count, timeout, freshness and reason. Check the selected branches in the draft before reviewing; the confirmation card summarizes their count rather than listing every branch.

**Save policy** commits the policy, security audit and operation receipt together. A success message means the policy was stored, not that inference became active. **Cancel review** abandons the preview without saving and lets you edit the draft again.

The security confirmation expires after **five minutes**. If it expires, cancel the review and prepare a fresh one after satisfying sign-in/MFA requirements. If another administrator changes policy, reload and review the latest saved policy before trying again.

If the save response is lost, retry **Save policy** from the same review while the session and confirmation are valid. The page reuses the operation key, and the server prevents that same operation from applying twice. If the outcome is uncertain or the session expires, sign in and use **Refresh policy** to inspect saved state before preparing another change.

## Disable globally

1. Enter an audit reason explaining the stop request.
2. Select **Disable globally**.
3. Review the preview: the global requested mode must be **Off**.
4. Select **Save policy** and confirm the saved requested/effective state and new revision.

**Disable globally is a review-and-save action, not an immediate one-click switch.** It prepares an Off request using the **last saved** timeout, snapshot age and pilot list; unrelated unsaved draft edits are not included. Pilot selections are retained for later review.

Turning inference Off does not delete samples, cancel tickets, change dispatch order, release resource allocations or alter booking reservations. Existing baseline sample capture is unchanged.

The policy boundary is designed to reject old results after a disable or policy revision change. A future publication already holding the policy transaction lock may commit before a concurrent disable; a disable is not a cancellation of work that already committed. The runtime caller is not connected today.

## Capture and diagnostics

| Display | Current interpretation |
| --- | --- |
| **Capture: not integrated** | Resource service-start observation capture is not wired into this controller. There is no capture toggle on this page. |
| **Privacy approval: not recorded** | The required resource capture privacy approval has not been recorded. A mode change does not supply it. |
| **Forecast support, latency, errors and last evidence: not collected** | These measurements are unavailable. This does not mean zero errors, zero latency or successful forecasts. |

The page shows sanitized policy/readiness metadata and a private read-only resource evidence view. It does not expose customer identities, unsanitized source rows, model artifacts or provider credentials.

## Resource inventory and reconciliation

Platform Admins with `platform.resource_inventory.read` can use this separate card to inspect a specific vendor branch. Search the business or location name, select the exact location (with tenant/location IDs), review the UTC window and choose **Load resource report**. The window must span no more than eight hours and contain the server's observation time. **Reset window around now** provides an initial window based on your browser clock; the server validates it independently.

Reports load manually. Search, location or window changes clear previous results; session expiry or access revocation clears private evidence. Check the displayed vendor/location, observed time and scan status before interpreting counts. Completion time is not a new observation, and reports do not automatically refresh.

- **Complete** means the bounded source scan completed. Readiness remains **Not ready**.
- **Unavailable** means counts and details could not be assessed; it does not mean zero demand or zero issues.
- **Row limit exceeded** preserves exact source counts and suppresses all inventory/finding evaluation.
- **Byte limit exceeded** suppresses inventory and finding counts. Source counts remain exact if available.
- Finding counts and classifications are separate from the **at most 32 examples**. Examples can omit counted issues.

Open a collection to inspect details, with 25 records per page. Current held allocations and released conversion history are separate; an expected end never releases capacity. Unknown fields remain unknown. Timestamp display uses milliseconds; internal capacity comparisons use PostgreSQL microseconds.

This view performs no historical repair, tracking activation, inference activation, capture or export. Customer estimates remain unchanged. Stable IDs and timestamps are private linkable operational data. See the [report contract and access boundary](../plan/resource-inventory-reconciliation-report.md).

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Private shadow is requested, but effective mode is Off | Read the blockers. Check global mode and exact pilot selection, then coordinate missing runtime/readiness/approval work. Repeatedly saving cannot remove server-owned blockers. |
| No locations match, or only 50 results appear | Search by vendor business or branch name; refine the query. Verify the location belongs to the intended tenant. |
| **The saved policy changed. Your draft is preserved.** | The preview revision is stale. Note the intended edits, explicitly discard the local draft, refresh the saved policy, compare it and reapply the intended changes before a new review. |
| Sign-in or security-code confirmation is required | Sign in again and complete MFA, then reopen the policy and prepare a fresh review. |
| **Session expired** | Sign in again. The page clears sensitive state and pending review. |
| **Access denied**, or read-only controls | Check Platform Admin access and the required permissions with the platform access owner. |
| Policy storage or API is unavailable | Do not assume the displayed draft was saved. Ask operations to check API/database availability and migrations, then refresh and inspect saved state. |
| Save fails or its result is uncertain | Use the same review's retry where valid; otherwise refresh saved state before preparing another operation. Record the error without customer details or secrets. |

## Controls that are not available yet

There is no customer-delivery mode, provider/API-key editor, artifact upload, model training action, resource tracking switch, editable ready flag or private capture toggle here. Those capabilities require their own reviewed integration and approval work.

Customer-facing inference still needs a ready resource producer and connected caller, approved private capture/privacy controls, representative evaluation for the service-start target, measured runtime budgets, customer labels and fallback behavior, eligible scopes and human rollout approval. Saving requested policy does not satisfy these requirements.

## Related documentation and implementation

- [AI Wait-Time Prediction PRD](../plan/ai-wait-time-prediction-prd.md)
- [Platform AI Inference control design and authority contract](../plan/platform-ai-inference-controls.md)
- [Resource shadow inference design](../plan/resource-shadow-inference.md)
- [Resource inventory and reconciliation report](../plan/resource-inventory-reconciliation-report.md)
- UI: `platform-dashboard-shadcn/src/components/platform-ai-inference.tsx`
- Policy validation: `backend/src/services/aiInferencePolicy.js`
- Status, scope search and policy writes: `backend/src/services/platformAiInferenceService.js`
- Security confirmation: `backend/src/services/privilegedTransactionService.js`

Update this guide when a reviewed release changes the controls, runtime integration or approval gates. Current operational settings must always be read from the dashboard; this document is not a live status report.
