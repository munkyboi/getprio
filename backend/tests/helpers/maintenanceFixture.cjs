const { loadModuleWithMocks } = require('./loadModuleWithMocks.cjs');
// Legacy unit tests isolate other behavior from the policy database. The real
// maintenance service stays in use; only its PostgreSQL boundary is replaced.
const row = { revision: '1', enabled: false, force_screen: false, message: 'Test maintenance', updated_at: new Date() };
const client = { query: async () => ({ rows: [row] }) };
const database = { pool: client, withTransaction: callback => callback(client) };
const maintenance = loadModuleWithMocks(require.resolve('../../src/services/platformMaintenanceService'), { '../config/db': database });
module.exports = { maintenance, database, row };
