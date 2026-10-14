async function readSubscription(client, subscriptionId, lock = false) {
  try {
    const result = await client.query(
      `SELECT * FROM tenant_subscriptions WHERE id = $1${lock ? " FOR UPDATE NOWAIT" : ""}`,
      [String(subscriptionId)]
    );
    return result.rows[0] || null;
  } catch (error) {
    if (lock && error.code === "55P03") {
      throw Object.assign(new Error("Subscription is being updated. Review the action and retry after that change completes."), {
        statusCode: 409, code: "SUBSCRIPTION_BUSY"
      });
    }
    throw error;
  }
}

async function readActor(client, actorId) {
  try {
    const result = await client.query(
      "SELECT id, roles, deletion_requested_at, platform_access_suspended_at FROM users WHERE id = $1 FOR SHARE NOWAIT",
      [String(actorId)]
    );
    return result.rows[0] || null;
  } catch (error) {
    if (error.code === "55P03") {
      throw Object.assign(new Error("Acting account is being updated. Review the action and retry after that change completes."), {
        statusCode: 409, code: "SUBSCRIPTION_ACTOR_BUSY"
      });
    }
    throw error;
  }
}

module.exports = { readSubscription, readActor };
