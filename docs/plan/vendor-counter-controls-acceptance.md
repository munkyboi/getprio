# Plan-aware counter toolbar and Skip/Recall acceptance

Status: local consumer implementation; core browser lifecycle accepted locally; remaining fault/race acceptance recorded. No PR, deployment or production acceptance.

## Contract and ownership

Queue owns the server and reviewed `docs/contracts/queue-counter-controls-v1.md` in `account-deletion-resource-plan`. Exact authorized copies of `queueCounterControlsV1.ts`, `queuePlanV2.ts`, and `queueSelectionPlanV3.ts` were adopted; V4 was not changed by this slice.

The beta toolbar reads authoritative selected-counter current/next context, actions, block reasons and typed existing-endpoint descriptors. It no longer relies on a location-wide new-plan guard. Request keys, abort signals and counter-keyed queries reject stale context; write transactions remain authoritative. Complete counter bindings accompany toolbar writes. Confirmation remains required; nested outcomes stay in the request view.

One synchronous command owner covers toolbar and V2/V3/V4 request command APIs. It prevents concurrent writes and retains a cloned exact body, target, scope and idempotency key after an ambiguous response. Retry cannot silently substitute a freshly read descriptor. Request dialogs retain their own reviewed command UI; toolbar recovery can reconcile an orphaned pending command after a scope change.

Skipped requests have a separate paginated list. Vendor Recall requires an explicit reason and current revision guards, returns the same stage to Waiting, preserves original band/age/sequence and creates neither allocation nor another ticket/allowance. Skip requires the exact current protected group and reason; it is not cancellation. Started work requires explicit outcomes/Interrupt.

## Local evidence

- First full frontend run: 322/322 passing; typecheck and focused lint passed. Latest focused context/command suite: 3/3 passing (stale identity, complete binding/reason transport, concurrent/ambiguous same-key retry). Final broader checks are recorded after completion.
- Actual owned Opera preview reads the new live local counter context. Demo Courts shows Alejandro VD019 Waiting, Call next enabled, other actions disabled with server explanations. No commands were issued against that user request.
- Queue reports fresh backup `before-skip-recall-2026-10-17T11-53-01-758Z.dump`, SHA256 `0f494ccf258c95acd5b668aded18b6149393759078661fd6e48098fcfe518fca`, exact recovery/receipt migrations, restart and HTTP200 context health. Queue verified ticket/plan/member/receipt hashes unchanged through that runtime window; its 213 scoped/receipt tests passed. This is owner-reported runtime evidence, separate from browser lifecycle acceptance.
- Queue prepared isolated QA Recovery 20261017 branch, location3, counters2/3, own ticket28/VD001 and plan `8bcbf0fd-1285-420c-855a-f4a5716b0539`, one court/two named trainers. Demo Courts cannot safely host toolbar QA because ordinary priority can choose Alejandro even on another counter. All QA commands must remain in the dedicated branch, with Queue collecting each transition.

## Outstanding acceptance

Core desktop browser lifecycle and 375px layout checks are complete below. Browser write-response ambiguity, double-submission and Start/Skip race injection still require a separately coordinated disposable fixture; pure owner regressions and Queue PostgreSQL races are separate evidence. Physical device/assistive technology, aggregate review, publication/deployment and production acceptance remain open. Browser control briefly stalled while resolving a document; no native action was used to interrupt the user's foreground tab. User forms and other tabs remain untouched. No production/runtime activation or publication is authorized by this local milestone.

## Completed direct browser cycle — 2026-10-17, Asia/Manila

Only location3 / own ticket28 / plan `8bcbf0fd-1285-420c-855a-f4a5716b0539` was changed. Actual Opera toolbar Call produced three protections, no allocations; reasoned Skip changed the request to Skipped and released all three protections. Explicit reasoned Recall returned the same ticket to Waiting with no holds/allocations. Toolbar Call again produced three protections under attempt2; toolbar Start at20:00:12 created three distinct named allocations. Completing TrainerA at20:00:30 retained TrainerC+court (two allocations); TrainerC at20:00:42 retained only court; court completion at20:00:51 produced Served with zero holds/allocations and one parent Start/Complete. Queue’s read-only collector recorded every transition under `.local-preview/replacement-20261016/skip-recall-browser-*.json` in its owning checkout.

Queue independently compared the saved baseline/Skip/Recall/Start/final records: ticket identity, priority band/age/sequence, allowance and publication versions unchanged; prior skipped stage byte-equivalent through final, three skipped children noncurrent, new attempt distinct. It compared Alejandro’s full ticket27 row with the pre-QA backup: exactly unchanged. No restore was performed.

Actual Opera375px light/dark: document scrollWidth375, all toolbar action controls44px tall, labels wrap. Temporary viewport/theme changes restored to normal desktop dark. Evidence: `counter-controls-375-dark.png`, `counter-controls-375-light.png`, and `counter-controls-desktop-served.png` under `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice`.

Read-only stale-context exercise: held counter2’s GET after its preflight; toolbar showed loading with actions disabled. Switched back to counter1; its current context appeared, and the old counter2 request was already aborted when released. Selected counter remained QA Recovery1. Fetch interception was cleared. This does not claim write-race or ambiguous-write browser acceptance.

An optional legacy local-pool summary returned404 on the deliberately unmarked QA branch. Queue confirmed its fixture opt-in boundary; frontend now omits this optional panel and stops404 polling, preserving other error states. No fixture marker, runtime authorization or resource policy was widened.

Final local verification: frontend324/324 tests passed, frontend typecheck passed, focused ESLint zero errors/warnings, production build passed23.05s with the existing large-chunk advisory, and git diff whitespace check passed. Exact three shared handoff files compare identical to Queue’s checkout. No staged files, commits, push or PR were created.

Cosmetic follow-up: the member-outcome left-border container is the shared nested extras list, not a blockquote primitive. A more-specific list reset had overridden its padding. Fixed selector specificity and applied4px semantic border,16px inline/8px vertical padding and member spacing. Actual ServedQA28 Opera desktop/375 light+dark verified computed4/16/8/8px,20px border-to-text gap, documentWidth375/no overflow; all original outcomes/timestamps retained. Evidence `member-outcome-inset-{desktop,375}-{light,dark}.png` in the same artifact directory. No data writes; dark desktop restored. Focused cosmetic verification and diff check passed; full suite not rerun for this CSS-only change.
