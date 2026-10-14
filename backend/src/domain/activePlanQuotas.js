function activeEntitlements(values) {
  const entitlements = { ...values };
  delete entitlements.monthlyQueueEmailJourneys;
  delete entitlements.monthlyTransactionalEmails;
  return entitlements;
}

function activeAllowances(values) {
  return Object.fromEntries(Object.entries(values || {}).filter(([key]) => key !== 'queueEmailJourneys'));
}

function assertNoRetiredEmailQuotas(plan) {
  if (Object.hasOwn(plan?.allowances || {}, 'queueEmailJourneys') ||
      Object.hasOwn(plan?.entitlements || {}, 'monthlyQueueEmailJourneys') ||
      Object.hasOwn(plan?.entitlements || {}, 'monthlyTransactionalEmails')) {
    const error = new Error('Queue email delivery is unmetered. Remove retired email quota fields before publishing a plan.');
    error.statusCode = 400;
    error.code = 'EMAIL_QUOTAS_RETIRED';
    throw error;
  }
}

module.exports = { activeAllowances, activeEntitlements, assertNoRetiredEmailQuotas };
