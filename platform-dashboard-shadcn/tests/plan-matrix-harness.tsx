// Local-only browser harness: the real editor, with its external API boundary replaced.
import { createRoot } from "react-dom/client"
import { PlanMatrix } from "../src/components/plan-matrix"
import { platformApi } from "../src/lib/platform-api"
import "../src/index.css"

if (!import.meta.env.DEV || !["localhost", "127.0.0.1"].includes(location.hostname)) throw new Error("Local test harness only")
const matrix = structuredClone(await platformApi.getPlanMatrix())
const viewer = await platformApi.getViewerContext()
matrix.planPolicyMutations = true
platformApi.getPlanMatrix = async () => structuredClone(matrix)
platformApi.getViewerContext = async () => ({ ...viewer, state: "available", data: { ...viewer.data!, capabilities: ["platform.plans.manage", "platform.queue_fees.manage"] } })
const calls: { previews: string[]; published: string[] } = { previews: [], published: [] }
let failed = false
platformApi.previewPlanPolicy = async (_action, target) => {
  calls.previews.push(target)
  return { revision: `review-${target}`, confirmationToken: `token-${target}` }
}
platformApi.publishPlan = async (plan, _reason, preview) => {
  if (preview.confirmationToken !== `token-${plan.slug}`) throw new Error("Wrong confirmation")
  if (location.search.includes("fail=1") && plan.slug === "pro" && !failed) { failed = true; throw new Error("Simulated Pro failure") }
  const updated = { ...plan, policyRevision: (plan.policyRevision ?? 1) + 1 }
  matrix.plans = matrix.plans.map((item) => item.slug === updated.slug ? updated : item)
  calls.published.push(plan.slug)
  document.querySelector("#saved")!.textContent = JSON.stringify({ calls, plans: matrix.plans.map(({ slug, name }) => ({ slug, name })) })
  return updated
}
createRoot(document.getElementById("root")!).render(<><PlanMatrix /><output id="saved" aria-label="Test server saved plans" /></>)
