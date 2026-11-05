import type { QueueDurationPolicyV4 } from "../../../shared/queueSelectionPlanV4";

export function countPolicyIssue(value: string, policy: QueueDurationPolicyV4): string | undefined {
  const count = Number(value);
  if (!value.trim() || !Number.isSafeInteger(count)) return "Enter a whole duration count.";
  if (count < policy.minCount || count > policy.maxCount) return `Enter a count from ${policy.minCount} to ${policy.maxCount}.`;
  if ((count - policy.minCount) % policy.stepCount !== 0) return `Use increments of ${policy.stepCount} from ${policy.minCount}.`;
  if (policy.mode === "fixed" && count !== policy.defaultCount) return "This service has a fixed duration count.";
  return undefined;
}
export type CountIntersection = { min: number; max: number; step: number; fixed: boolean };
function inverse(a: bigint, modulus: bigint): bigint {
  let [oldR, r, oldS, s] = [a, modulus, 1n, 0n];
  while (r !== 0n) { const q = oldR / r; [oldR, r] = [r, oldR - q * r]; [oldS, s] = [s, oldS - q * s]; }
  return oldS;
}
const mod = (value: bigint, base: bigint) => ((value % base) + base) % base;
const gcd = (a: bigint, b: bigint): bigint => b === 0n ? a : gcd(b, a % b);
/** Intersect every min-based count lattice; no first-service policy or count coercion. */
export function countPolicyIntersection(policies: QueueDurationPolicyV4[], maximum?: number): CountIntersection | null {
  if (!policies.length) return null;
  let lower = 1, upper = Number.MAX_SAFE_INTEGER, residue = 0n, step = 1n;
  for (const policy of policies) {
    if (![policy.minCount, policy.maxCount, policy.stepCount, policy.defaultCount, policy.baseMinutes].every(value => Number.isSafeInteger(value) && value > 0) ||
        policy.minCount > policy.maxCount || countPolicyIssue(String(policy.defaultCount), policy)) return null;
    lower = Math.max(lower, policy.mode === "fixed" ? policy.defaultCount : policy.minCount);
    upper = Math.min(upper, policy.mode === "fixed" ? policy.defaultCount : policy.maxCount);
    const nextStep = BigInt(policy.stepCount), nextResidue = BigInt(policy.minCount), common = gcd(step, nextStep);
    if ((nextResidue - residue) % common !== 0n) return null;
    const multiplier = mod((nextResidue - residue) / common * inverse(step / common, nextStep / common), nextStep / common);
    residue = mod(residue + step * multiplier, step / common * nextStep);
    step = step / common * nextStep;
  }
  if (maximum !== undefined) {
    if (!Number.isSafeInteger(maximum) || maximum < 0) return null;
    upper = Math.min(upper, maximum);
  }
  let first = residue;
  if (first < BigInt(lower)) first += (BigInt(lower) - first + step - 1n) / step * step;
  if (first > BigInt(upper)) return null;
  const last = first + (BigInt(upper) - first) / step * step;
  return {min: Number(first), max: Number(last), step: first === last ? 1 : Number(step), fixed: first === last};
}
