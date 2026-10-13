const crypto = require("node:crypto");
const path = require("node:path");
const db = require("../config/db");
const inbox = require("./customerNotificationInbox");
const registrations = require(path.resolve(__dirname, "../../mobile/pushRegistrationRepository.js"));
const deliveries = require(path.resolve(__dirname, "../../mobile/mobilePushOutboxDeliveryRepository.js"));
const fcm = require(path.resolve(__dirname, "../../mobile/fcmRegistrationService.js"));

const ELIGIBLE = `b.status IN ('confirmed','rescheduled') AND b.checked_in_at IS NULL
  AND b.queue_ticket_id IS NULL AND b.customer_user_id IS NOT NULL
  AND b.payment_status IN ('unpaid','paid')
  AND u.deletion_requested_at IS NULL AND u.platform_access_suspended_at IS NULL
  AND u.notification_settings->'bookingAlerts' IS DISTINCT FROM 'false'::jsonb
  AND t.is_active=TRUE AND l.is_active=TRUE`;

function reminderPayload(booking, intent) {
  const localTime = new Intl.DateTimeFormat("en-PH", {
    timeZone: booking.timezone || "Asia/Manila", dateStyle: "medium", timeStyle: "short"
  }).format(new Date(booking.scheduled_start_at));
  const route = `/account/bookings/${booking.id}`;
  return { title: "Upcoming booking",
    body: `${booking.reference} at ${booking.tenant_name} starts in about ${intent.booking_reminder_stage === "24h" ? "24 hours" : "1 hour"} (${localTime}).`,
    route, url: route, eventType: `customer_booking_reminder_${intent.booking_reminder_stage}`,
    notificationId: intent.idempotency_key, tag: intent.idempotency_key,
    collapseId: crypto.createHash("sha256").update(intent.idempotency_key).digest("hex") };
}

function createBookingReminderService({ database = db, notificationInbox = inbox,
  pushRegistrations = registrations, pushDeliveries = deliveries, sender = fcm,
  enabled = () => process.env.BOOKING_REMINDERS_ENABLED !== "false" } = {}) {
  async function enqueueDue() {
    if (!enabled()) return 0;
    return database.withTransaction(async client => {
      await client.query("SET LOCAL lock_timeout='1s'");
      // No operational row locks, queue transitions or resource writes. Dispatch
      // rereads eligibility after its waits before emitting any visible alert.
      await client.query(`UPDATE queue_notification_outbox o SET status='obsolete',
        lease_owner=NULL,leased_until=NULL,updated_at=clock_timestamp()
        WHERE o.booking_id IS NOT NULL AND o.status IN ('pending','retry','processing')
          AND (o.expires_at <= clock_timestamp() OR NOT EXISTS (
            SELECT 1 FROM bookings b JOIN users u ON u.id=b.customer_user_id
              JOIN tenants t ON t.id=b.tenant_id JOIN store_locations l ON l.id=b.location_id AND l.tenant_id=b.tenant_id
            WHERE b.id=o.booking_id AND b.reminder_schedule_revision=o.booking_schedule_revision
              AND o.recipient_key='user:'||b.customer_user_id::text AND ${ELIGIBLE}))`);
      const result = await client.query(`INSERT INTO queue_notification_outbox
        (idempotency_key,booking_id,booking_schedule_revision,booking_reminder_stage,tenant_id,
         recipient_key,channel,template_name,available_at,expires_at)
        SELECT due.key,b.id,b.reminder_schedule_revision,stage.name,b.tenant_id,
          'user:'||b.customer_user_id::text,'fcm','booking_reminder_'||stage.name,due.at,due.at+INTERVAL '10 minutes'
        FROM bookings b JOIN users u ON u.id=b.customer_user_id
          JOIN tenants t ON t.id=b.tenant_id JOIN store_locations l ON l.id=b.location_id AND l.tenant_id=b.tenant_id
          CROSS JOIN (VALUES ('24h',INTERVAL '24 hours'),('1h',INTERVAL '1 hour')) stage(name,offset_time)
          CROSS JOIN LATERAL (SELECT b.scheduled_start_at-stage.offset_time AS at,
            'booking:'||b.id::text||':schedule:'||b.reminder_schedule_revision::text||':reminder:'||stage.name AS key) due
        WHERE ${ELIGIBLE} AND b.reminder_eligible_at <= due.at
          AND b.scheduled_start_at > clock_timestamp() AND b.scheduled_start_at <= clock_timestamp()+INTERVAL '24 hours'
          AND due.at <= clock_timestamp() AND due.at+INTERVAL '10 minutes' > clock_timestamp()
          AND NOT EXISTS (SELECT 1 FROM queue_notification_outbox prior WHERE prior.idempotency_key=due.key)
        ORDER BY due.at,b.id LIMIT 100
        ON CONFLICT(idempotency_key) DO NOTHING`, []);
      return result.rowCount;
    });
  }

  async function readEligible(client, intent, workerId) {
    // User-before-booking agrees with account deletion. We never request branch
    // or resource locks after booking; operational writers retain branch-first order.
    await client.query("SET LOCAL lock_timeout='1s'");
    const userId = /^user:([1-9]\d*)$/u.exec(intent.recipient_key)?.[1];
    if (!userId) throw new Error("Booking reminder must target an account.");
    await client.query("SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE", [userId]);
    await client.query("SELECT id FROM bookings WHERE id=$1 FOR SHARE", [String(intent.booking_id)]);
    const { rows: [owned] } = await client.query(`SELECT id,expires_at FROM queue_notification_outbox
      WHERE id=$1 AND status='processing' AND lease_owner=$2 AND leased_until > clock_timestamp()
      FOR UPDATE`, [String(intent.id), workerId]);
    if (!owned) return null;
    intent = {...intent,expires_at:owned.expires_at};
    const { rows: [booking] } = await client.query(`SELECT b.id::text,b.reference,b.scheduled_start_at,
      t.name AS tenant_name,l.timezone,
      LEAST($4::timestamptz,b.scheduled_start_at-CASE WHEN $5='24h' THEN INTERVAL '24 hours' ELSE INTERVAL '1 hour' END+INTERVAL '10 minutes') AS window_end
      FROM bookings b JOIN users u ON u.id=b.customer_user_id
        JOIN tenants t ON t.id=b.tenant_id JOIN store_locations l ON l.id=b.location_id AND l.tenant_id=b.tenant_id
      WHERE b.id=$1 AND b.reminder_schedule_revision=$2 AND b.customer_user_id=$3
        AND ${ELIGIBLE} AND b.reminder_eligible_at <= b.scheduled_start_at-
        CASE WHEN $5='24h' THEN INTERVAL '24 hours' ELSE INTERVAL '1 hour' END
        AND b.scheduled_start_at-CASE WHEN $5='24h' THEN INTERVAL '24 hours' ELSE INTERVAL '1 hour' END <= clock_timestamp()
        AND b.scheduled_start_at-CASE WHEN $5='24h' THEN INTERVAL '24 hours' ELSE INTERVAL '1 hour' END+INTERVAL '10 minutes' > clock_timestamp()
      AND $4::timestamptz > clock_timestamp()`,
    [String(intent.booking_id),String(intent.booking_schedule_revision),userId,intent.expires_at,intent.booking_reminder_stage]);
    if (!enabled() || !booking) {
      await client.query("UPDATE queue_notification_outbox SET status='obsolete',lease_owner=NULL,leased_until=NULL WHERE id=$1", [String(intent.id)]);
      return null;
    }
    return {userId,booking,intent:{...intent,expires_at:booking.window_end}};
  }

  async function dispatch(intent, workerId, {timeoutMs = 10_000} = {}) {
    const captured = await database.withTransaction(async client => {
      const current = await readEligible(client,intent,workerId);
      if (!current) return null;
      const payload = reminderPayload(current.booking,current.intent);
      await notificationInbox.record({userId:current.userId,...payload}, {client});
      return {payload};
    });
    if (!captured) return {skipped:true};
    // History is committed before any external side effect. Revalidate all state
    // in a separate delivery transaction; capture never grants future eligibility.
    const result = await database.withTransaction(async client => {
      const current = await readEligible(client,intent,workerId);
      if (!current) return {skipped:true};
      const {userId} = current;
      intent = current.intent;
      const payload = captured.payload;
      const active = await pushRegistrations.listActiveByUserId(userId,{client});
      await pushDeliveries.ensurePending(String(intent.id),active,{client});
      const pending = await pushDeliveries.claimPending(String(intent.id),workerId,{client});
      if (!pending.length) return {attempted:0,sent:0};
      const {rows:[deadline]} = await client.query("SELECT EXTRACT(EPOCH FROM ($1::timestamptz-clock_timestamp()))*1000 AS remaining_ms", [intent.expires_at]);
      if (Number(deadline.remaining_ms) <= 0) {
        await pushDeliveries.releasePending(String(intent.id),workerId,{client});
        await client.query("UPDATE queue_notification_outbox SET status='obsolete',lease_owner=NULL,leased_until=NULL WHERE id=$1", [String(intent.id)]);
        return {skipped:true};
      }
      let outcome;
      try {
        // Bound the external provider call to at most ten seconds, never
        // past the due window. No branch lock is held across the provider call.
        outcome = await sender.sendToRegistrations({registrations:pending,payload,
          timeoutMs:Math.max(1,Math.min(10_000,Number(timeoutMs)||10_000,Math.floor(Number(deadline.remaining_ms))))});
      } catch {
        await pushDeliveries.releasePending(String(intent.id),workerId,{client});
        return {retry:"Booking reminder delivery failed."};
      }
      if (!outcome.configured) {
        await pushDeliveries.releasePending(String(intent.id),workerId,{client});
        return {retry:"Booking reminder FCM is not configured."};
      }
      let retry = false;
      for (const item of outcome.outcomes) {
        const options = {client,workerId};
        if (item.status === "accepted") await pushDeliveries.markSent(String(intent.id),String(item.registrationId),options);
        else if (["stale","inactive"].includes(item.status)) await pushDeliveries.markStale(String(intent.id),String(item.registrationId),options);
        else { await pushDeliveries.markFailure(String(intent.id),String(item.registrationId),item.error,options); retry = true; }
      }
      return {attempted:outcome.attempted,sent:outcome.sent,...(retry?{retry:"Booking reminder has transient device failures."}:{})};
    });
    // Commit accepted-device progress before asking the outbox to
    // retry. A crash after provider acceptance is still an at-least-once boundary.
    if (result.retry) throw new Error(result.retry);
    return result;
  }
  return {enqueueDue,dispatch};
}
module.exports = {reminderPayload,createBookingReminderService,...createBookingReminderService()};
