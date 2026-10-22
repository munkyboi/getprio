// Legacy mutation routes must never bypass the v2 plan/stage/revision boundary.
async function assertLegacyTicket(client, ticket) {
  if (!ticket) return;
  const result = await client.query(
    `SELECT to_jsonb(p)->>'contract_version' AS version FROM ticket_service_plans p
  WHERE p.tenant_id=$1 AND p.location_id=$2 AND p.ticket_id=$3`,
    [ticket.tenantId, ticket.locationId, ticket._id],
  );
  if (["2", "3", "4"].includes(result.rows[0]?.version))
    throw Object.assign(
      new Error(
        "Use this ticket’s service-plan actions so its revisions and resource groups stay protected.",
      ),
      { statusCode: 409, code: "USE_QUEUE_PLAN_COMMAND" },
    );
}
module.exports = { assertLegacyTicket };
