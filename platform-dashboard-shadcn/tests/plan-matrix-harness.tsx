// Local-only browser harness: the real editor, with its external API boundary replaced.
import { createRoot } from "react-dom/client"
import { PlanMatrix } from "../src/components/plan-matrix"
import { platformApi } from "../src/lib/platform-api"
import "../src/index.css"

if (!import.meta.env.DEV || !["localhost", "127.0.0.1"].includes(location.hostname)) throw new Error("Local test harness only")
const matrix = structuredClone(await platformApi.getPlanMatrix())
const viewer = await platformApi.getViewerContext()
matrix.planPolicyMutations = true
matrix.queueEmailQuotaRetired = !location.search.includes("legacy=1")
platformApi.getPlanMatrix = async () => structuredClone(matrix)
platformApi.getViewerContext = async () => ({ ...viewer, state: "available", data: { ...viewer.data!, capabilities: ["platform.plans.manage", "platform.queue_fees.manage"] } })
const calls: { previews: string[]; published: string[] } = { previews: [], published: [] }
const reviewedPayloads = new Map<string, string>()
let failed = false
function verifyPlanPayload(plan: { allowances?: object; entitlements: object }) {
  const fields = [Object.hasOwn(plan.allowances || {}, "queueEmailJourneys"), Object.hasOwn(plan.entitlements, "monthlyQueueEmailJourneys"), Object.hasOwn(plan.entitlements, "monthlyTransactionalEmails")]
  if (matrix.queueEmailQuotaRetired && fields.some(Boolean)) throw new Error("Retired email quota fields reached preview/publication")
  if (!matrix.queueEmailQuotaRetired && !fields.every(Boolean)) throw new Error("Legacy plan compatibility fields were discarded")
}
platformApi.previewPlanPolicy = async (action, target, payload) => {
  if (action === "plan.defaults.publish") verifyPlanPayload(payload.plan as { allowances?: object; entitlements: object })
  reviewedPayloads.set(target, JSON.stringify(payload.plan))
  calls.previews.push(target)
  return { revision: `review-${target}`, confirmationToken: `token-${target}` }
}
platformApi.publishPlan = async (plan, _reason, preview) => {
  verifyPlanPayload(plan)
  if (reviewedPayloads.get(plan.slug) !== JSON.stringify(plan)) throw new Error("Published plan differs from the reviewed payload")
  if (preview.confirmationToken !== `token-${plan.slug}`) throw new Error("Wrong confirmation")
  if (location.search.includes("fail=1") && plan.slug === "pro" && !failed) { failed = true; throw new Error("Simulated Pro failure") }
  const original = matrix.plans.find((item) => item.slug === plan.slug)!
  const updated = { ...original, ...plan, entitlements: { ...original.entitlements, ...plan.entitlements }, allowances: { ...original.allowances!, ...plan.allowances }, policyRevision: (plan.policyRevision ?? 1) + 1 }
  matrix.plans = matrix.plans.map((item) => item.slug === updated.slug ? updated : item)
  calls.published.push(plan.slug)
  document.querySelector("#saved")!.textContent = JSON.stringify({ calls, plans: matrix.plans.map(({ slug, name }) => ({ slug, name })) })
  return updated
}
createRoot(document.getElementById("root")!).render(<><PlanMatrix /><output id="saved" aria-label="Test server saved plans" /></>)
