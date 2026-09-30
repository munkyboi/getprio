const test = require("node:test");
const assert = require("node:assert/strict");
const queues = require("../src/repositories/developerQueues");
const db = require("../src/config/db");
const env = require("../src/config/env");

function fixture(environment = "sandbox", { failCapture = false } = {}) {
  const samples = [];
  const queries = [];
  let ticket;
  const input = { projectId: "project-1", environment, profileId: "profile-1", queueId: "queue-1", queueSlug: "main" };
  const client = {
    async query(sql, params) {
      queries.push(sql);
      if (sql.includes("FROM developer_api_queues")) return { rows: [{ queue_id: input.queueId, session_state: "open", intake_enabled: true, queue_prefix: "MAIN" }] };
      if (sql.includes("INSERT INTO developer_sandbox_daily_allowances")) return { rows: [{ issued_tickets: 1 }] };
      if (sql.includes("MAX(sequence)")) return { rows: [{ next_sequence: 1 }] };
      if (sql.includes("INSERT INTO developer_api_tickets")) {
        ticket = { ticket_id: "ticket-1", id: "ticket-1", developer_project_id: input.projectId, environment,
          developer_api_profile_id: input.profileId, developer_api_queue_id: input.queueId,
          status: "waiting", sequence: 1, ticket_number: params[4], resource_version: 1,
          linked_user_id: null, created_at: new Date(), updated_at: new Date() };
        return { rows: [ticket] };
      }
      if (sql.includes("INSERT INTO developer_api_ticket_events")) return { rows: [{ id: "event-1", developer_api_ticket_id: ticket.id, event_type: params[5] }] };
      if (sql.includes("WITH active AS")) return { rows: [{ ...ticket, queue_position: ticket.status === "waiting" ? 1 : null,
        waiting_count: 1, configured_average_service_minutes: 15, session_state: "open", intake_enabled: true }] };
      if (sql.includes("INSERT INTO developer_api_wait_time_prediction_samples")) {
        if (failCapture) throw new Error("capture unavailable");
        const duplicate = samples.some((sample) => sample.ticketId === params[0] && sample.bucket.getTime() === params[7].getTime());
        if (!duplicate) samples.push({ ticketId: params[0], bucket: params[7], sampledAt: params[8], estimate: params[10], outcome: params[11] });
        return { rowCount: duplicate ? 0 : 1 };
      }
      if (sql.includes("UPDATE developer_api_wait_time_prediction_samples")) {
        for (const sample of samples) if (!sample.outcome) {
          sample.outcome = params[1];
          sample.actualWait = params[1] === "called" ? Math.max(0, (params[2] - sample.sampledAt) / 60000) : null;
        }
        return { rowCount: samples.length };
      }
      if (sql.includes("UPDATE developer_api_tickets")) {
        ticket = { ...ticket, status: params[1], called_at: params[1] === "called" ? new Date(Date.now() + 120000) : null, updated_at: new Date(Date.now() + 120000) };
        return { rows: [ticket] };
      }
      if (sql.includes("SELECT id FROM developer_api_tickets")) return { rows: [] };
      if (sql.includes("FROM developer_api_tickets")) return { rows: ticket ? [ticket] : [] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  return { client, input, samples, queries };
}

function captureFlag(t, enabled) {
  const original = env.waitTimePredictionCaptureEnabled;
  env.waitTimePredictionCaptureEnabled = enabled;
  t.after(() => { env.waitTimePredictionCaptureEnabled = original; });
}

test("printed-only Sandbox issuance and call-next complete a prediction without a mobile request", async (t) => {
  captureFlag(t, true);
  const { client, input, samples } = fixture();
  const original = db.withTransaction;
  db.withTransaction = async () => { throw new Error("Unexpected separate prediction transaction"); };
  t.after(() => { db.withTransaction = original; });
  const issued = await queues.issueTicket(input, { client });
  assert.equal(issued.linkedUserId, null);
  assert.equal(issued.estimatedWaitMinutes, 15);
  assert.equal(samples.length, 1);
  assert.equal(samples[0].estimate, issued.estimatedWaitMinutes);
  assert.equal(samples[0].outcome, null);
  const called = await queues.callNextTicket(input, { client });
  assert.equal(called.status, "called");
  assert.equal(samples[0].outcome, "called");
  assert.ok(samples[0].actualWait >= 2);
});

test("later Sandbox mobile observation in the same bucket does not duplicate issuance", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-01T10:01:00Z").getTime() });
  captureFlag(t, true);
  const { client, input, samples } = fixture();
  const issued = await queues.issueTicket(input, { client });
  await queues.mobileQueueMetrics(input.queueId, issued.id, { client, environment: "sandbox" });
  assert.equal(samples.length, 1);
});

test("printed-only cancellation censors its issuance observation", async (t) => {
  captureFlag(t, true);
  const { client, input, samples } = fixture();
  const issued = await queues.issueTicket(input, { client });
  await queues.transitionTicket({ ...input, ticketId: issued.id, fromStatus: "waiting", toStatus: "cancelled" }, { client });
  assert.equal(samples[0].outcome, "censored");
  assert.equal(samples[0].actualWait, null);
});

test("disabled capture still returns the Sandbox issuance estimate", async (t) => {
  captureFlag(t, false);
  const { client, input, samples } = fixture();
  const issued = await queues.issueTicket(input, { client });
  assert.equal(issued.estimatedWaitMinutes, 15);
  assert.equal(samples.length, 0);
});

test("production issuance does not collect Sandbox samples or add an estimate", async (t) => {
  captureFlag(t, true);
  const { client, input, samples, queries } = fixture("production");
  const issued = await queues.issueTicket(input, { client });
  assert.equal(Object.hasOwn(issued, "estimatedWaitMinutes"), false);
  assert.equal(samples.length, 0);
  assert.ok(!queries.some((sql) => sql.includes("WITH active AS")));
});

test("issuance capture failures propagate to the caller transaction", async (t) => {
  captureFlag(t, true);
  const { client, input } = fixture("sandbox", { failCapture: true });
  await assert.rejects(queues.issueTicket(input, { client }), /capture unavailable/);
});

test("standalone issuance opens one transaction for ticket and observation", async (t) => {
  captureFlag(t, true);
  const { client, input, samples } = fixture();
  const original = db.withTransaction;
  let transactions = 0;
  db.withTransaction = async (run) => { transactions += 1; return run(client); };
  t.after(() => { db.withTransaction = original; });
  await queues.issueTicket(input);
  assert.equal(transactions, 1);
  assert.equal(samples.length, 1);
});
