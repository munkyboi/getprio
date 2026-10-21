const db = require("../config/db");
const drafts = require("../repositories/queuePlanDrafts");
const {
  withVendorQueueTransaction,
} = require("./vendorQueueTransactionService");
const { assertPublicTextFieldsAllowed } = require("./contentModeration");
const projection = require("../repositories/queuePlanProjection");

async function run({ tenant, location, actorUserId }, operation) {
  return withVendorQueueTransaction(
    {
      pool: db.pool,
      tenant,
      location,
      actorUserId,
      permission: "tenant.queue.operate",
    },
    (client, _ledger, actor) =>
      operation(client, {
        tenantId: String(tenant._id),
        locationId: String(location._id),
        actorUserId: String(actorUserId),
        actorRole: actor.tenantMemberships[0].role,
      }),
  );
}
async function mutate(context, command) {
  drafts.validateDraft(command.body);
  assertPublicTextFieldsAllowed({
    "Customer name": command.body.customer?.name,
    Notes: command.body.notes,
  });
  return run(context, (client, scope) =>
    drafts.command(client, scope, command).then(async result => ({...result,plan:await require("./queueDraftReadinessService").decorate(client,scope,context,result.plan)})),
  );
}
async function read(context, id) {
  let expired = false;
  const result = await run(context, async (client, scope) => {
    const row = await drafts.find(client, scope, id);
    if (row.state === "published")
      expired = await require("../repositories/queueGroupedLedger").expireUnstarted(
        client,
        scope,
        row,
      );
    return {
      plan:
        row.state === "published"
          ? await projection.read(client, scope, row)
          : await require("./queueDraftReadinessService").decorate(client,scope,context,drafts.dto(row)),
    };
  });
  if (expired) notifyExpiry(context);
  return result;
}
function notifyExpiry({tenant, location}) {
  require("./queueEvents").publish(tenant.slug, {type:"queue-plans-updated", locationId:String(location._id)}, {locationId:location._id});
}
async function list(context, cursor, state) {
  let expired = false;
  const result = await run(context, async (client, scope) => {
    const result = await drafts.list(client, scope, cursor, state);
    if (["active", "skipped"].includes(state)) {
      const plans = [];
      let windowPromise;
      const hoursOptions = {getWindow:()=>windowPromise ||= require("./queueServiceHoursService").readWindow(client,scope)};
      for (const plan of result.plans) {
        const row = await drafts.find(client, scope, plan.id, true);
        const changed = await require("../repositories/queueGroupedLedger").expireUnstarted(
          client,
          scope,
          row,
        );
        expired ||= changed;
        plans.push(await projection.read(client, scope, row,hoursOptions));
      }
      result.plans = plans;
    }
    if (state === undefined || state === "draft") result.plans=await Promise.all(result.plans.map(plan=>require("./queueDraftReadinessService").decorate(client,scope,context,plan)));
    return result;
  });
  if (expired) notifyExpiry(context);
  return result;
}
async function selectionOptions(context, contractVersion = 3) {
  return run(context, (client, scope) =>
    require(
      contractVersion === 4
        ? "./queueSelectionCaptureV4"
        : "./queueSelectionCapture",
    ).readCatalog(client, scope),
  );
}
async function remove(context, command) { return run(context, (client, scope) => drafts.remove(client, scope, command)); }
module.exports = { mutate, remove, read, list, selectionOptions };
