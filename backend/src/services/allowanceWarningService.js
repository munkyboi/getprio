const releaseControls = require("../config/releaseControls");
const allowanceLedgerRepository = require("../repositories/allowanceLedger");
const notificationService = require("./notificationService");

const RESOURCE_LABELS = {
  queueTickets: "Queue Ticket",
  queueEmailJourneys: "Queue Email Journey",
  serviceBookings: "Service Booking"
};

async function dispatchPendingWarnings() {
  if (!releaseControls.allowanceObserve && !releaseControls.allowanceQueueTickets &&
      !releaseControls.allowanceQueueEmailJourneys && !releaseControls.allowanceServiceBookings) return 0;
  const warnings = await allowanceLedgerRepository.claimWarningDeliveries();
  for (const warning of warnings) {
    try {
      const label = RESOURCE_LABELS[warning.resource_key] || warning.resource_key;
      const recipients = warning.recipients || [];
      if (recipients.length === 0) throw new Error("No active tenant owner or admin email recipient was found.");
      await Promise.all(recipients.map((to) => notificationService.sendEmail({
        to,
        tenantId: warning.tenant_id,
        purpose: "allowance_warning",
        subject: `${warning.tenant_name} reached ${warning.threshold_percent}% of its ${label} allowance`,
        text: `${warning.tenant_name} has used at least ${warning.threshold_percent}% of its monthly ${label} base allowance. The current period resets on ${new Date(warning.period_end).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}. Review capacity in the vendor dashboard.`
      })));
      await allowanceLedgerRepository.completeWarningDelivery(warning.id, null);
    } catch (error) {
      await allowanceLedgerRepository.completeWarningDelivery(warning.id, error);
    }
  }
  return warnings.length;
}

module.exports = { dispatchPendingWarnings };
