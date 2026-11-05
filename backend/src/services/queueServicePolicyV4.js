function fail(code, message, statusCode = 400) {
  throw Object.assign(new Error(message), { code, statusCode });
}
function object(value, fields) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => fields.includes(key)) &&
    fields.every((key) => Object.hasOwn(value, key))
  );
}
function integer(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
function configuration(input) {
  if (
    !object(input, ["labels", "assignment", "duration", "extras", "execution"])
  )
    fail(
      "INVALID_SERVICE_POLICY",
      "Provide the complete explicit service configuration.",
    );
  if (
    !object(input.labels, ["service", "resources", "duration", "extras"]) ||
    Object.values(input.labels).some(
      (value) =>
        typeof value !== "string" || !value.trim() || value.length > 60,
    )
  )
    fail(
      "INVALID_SERVICE_POLICY",
      "Provide accessible service, resource, duration and extra labels.",
    );
  if (
    !object(input.assignment, ["mode", "allocationIdentity"]) ||
    !["named", "automatic"].includes(input.assignment.mode) ||
    input.assignment.allocationIdentity !==
      (input.assignment.mode === "named" ? "named_member" : "pooled_capacity")
  )
    fail(
      "UNSUPPORTED_SERVICE_POLICY",
      "Choose named resources or automatic pooled capacity. Automatic named-member selection is unavailable.",
    );
  const d = input.duration;
  if (
    !object(d, [
      "mode",
      "visible",
      "baseMinutes",
      "minCount",
      "maxCount",
      "stepCount",
      "defaultCount",
    ]) ||
    !["fixed", "adjustable"].includes(d.mode) ||
    typeof d.visible !== "boolean" ||
    !integer(d.baseMinutes, 5, 480) ||
    !integer(d.minCount, 1, 96) ||
    !integer(d.maxCount, d.minCount, 96) ||
    !integer(d.stepCount, 1, 96) ||
    !integer(d.defaultCount, d.minCount, d.maxCount) ||
    (d.maxCount - d.minCount) % d.stepCount !== 0 ||
    (d.defaultCount - d.minCount) % d.stepCount !== 0 ||
    d.baseMinutes * d.maxCount > 480 ||
    (d.mode === "fixed" &&
      (d.minCount !== d.maxCount ||
        d.defaultCount !== d.minCount ||
        d.stepCount !== 1)) ||
    (!d.visible && d.mode !== "fixed")
  )
    fail(
      "INVALID_DURATION_POLICY",
      "Provide explicit integer duration bounds, step, base and default; hidden duration must be fixed.",
    );
  if (
    !Array.isArray(input.extras) ||
    input.extras.length > 20 ||
    new Set(input.extras.map((extra) => extra?.serviceId)).size !==
      input.extras.length ||
    input.extras.some(
      (extra) =>
        !object(extra, ["serviceId", "selection"]) ||
        typeof extra.serviceId !== "string" ||
        !/^[1-9]\d{0,18}$/u.test(extra.serviceId) ||
        BigInt(extra.serviceId) > 9223372036854775807n ||
        !["required", "optional"].includes(extra.selection),
    )
  )
    fail(
      "INVALID_SERVICE_POLICY",
      "Configure unique eligible extras with an explicit selection requirement.",
    );
  if (
    !object(input.execution, [
      "resourceStart",
      "extraStart",
      "extraContainment",
      "selectedExtraResolution",
    ]) ||
    input.execution.resourceStart !== "together" ||
    input.execution.extraStart !== "with_parent" ||
    input.execution.extraContainment !== "within_parent" ||
    input.execution.selectedExtraResolution !== "explicit_required"
  )
    fail(
      "UNSUPPORTED_SERVICE_POLICY",
      "Only together resource starts, parent-aligned contained extras and explicit selected-extra resolution are supported.",
    );
  return structuredClone(input);
}
function duration(count, acceptedRevision, policy) {
  if (
    typeof acceptedRevision !== "string" ||
    acceptedRevision !== policy.revision
  )
    fail(
      "STALE_DURATION_POLICY",
      "The duration policy changed. Review the configured base and bounds.",
      409,
    );
  const d = policy.duration;
  if (
    !Number.isSafeInteger(count) ||
    count < d.minCount ||
    count > d.maxCount ||
    (count - d.minCount) % d.stepCount !== 0 ||
    (d.mode === "fixed" && count !== d.defaultCount)
  )
    fail(
      "INVALID_DURATION_COUNT",
      "Duration count must match the configured integer bounds and step.",
    );
  const minutes = count * d.baseMinutes;
  if (!Number.isSafeInteger(minutes) || minutes < 5 || minutes > 480)
    fail(
      "INVALID_DURATION_COUNT",
      "The configured duration total is outside supported bounds.",
    );
  return {
    durationCount: count,
    baseMinutes: d.baseMinutes,
    durationMinutes: minutes,
    durationPolicyRevision: policy.revision,
    durationPolicy: { ...structuredClone(d), revision: policy.revision },
  };
}
module.exports = { configuration, duration };
