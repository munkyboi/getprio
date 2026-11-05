const { createResourceInventoryReconciliationReport } = require('./resourceInventoryReconciliationReport');
// Internal only: no application pool, route, forecast adapter, capture, or activation.
function createResourceSourceAssessment(config) {
  return createResourceInventoryReconciliationReport({ ...config, includeSourceAssessment:true });
}
module.exports = { createResourceSourceAssessment };
