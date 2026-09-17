const db = require("../config/db");

async function runRetentionSweep(options = {}) {
  const client = options.client || db.pool;
  const expiredOperations = await client.query(
    `DELETE FROM developer_api_operations
     WHERE expires_at < NOW()
     RETURNING id`
  );
  const deletedCustomerData = await client.query(
    `UPDATE developer_api_tickets
     SET display_label = NULL,
       external_reference = NULL,
       recipient_email = NULL,
       linked_user_id = NULL,
       linking_disabled_at = COALESCE(linking_disabled_at, NOW()),
       customer_data_deleted_at = NOW(),
       updated_at = NOW()
     WHERE terminal_at < NOW() - INTERVAL '90 days'
       AND customer_data_deleted_at IS NULL
     RETURNING id`
  );
  return {
    expiredOperationCount: expiredOperations.rowCount,
    deletedCustomerDataCount: deletedCustomerData.rowCount
  };
}

module.exports = { runRetentionSweep };
