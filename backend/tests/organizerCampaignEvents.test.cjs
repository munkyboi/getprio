const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const campaignEvents = require("../src/services/organizerCampaignEvents");

test("organizer campaign events notify only subscribers to the changed campaign", () => {
  const received = [];
  const unsubscribeCampaign9 = campaignEvents.subscribe("9", (payload) => received.push(["9", payload]));
  const unsubscribeCampaign10 = campaignEvents.subscribe("10", (payload) => received.push(["10", payload]));

  campaignEvents.publish("9", { eventType: "contribution_proof_submitted" });
  unsubscribeCampaign9();
  unsubscribeCampaign10();

  assert.deepEqual(received, [["9", { eventType: "contribution_proof_submitted" }]]);
});

test("public campaign SSE exposes only a change signal and cleans up subscribers", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/routes/publicRoutes.js"), "utf8");

  assert.match(source, /"\/campaigns\/:publicToken\/stream"/);
  assert.match(source, /Content-Type", "text\/event-stream"/);
  assert.match(source, /organizerCampaignEvents\.subscribe\(campaign\.id/);
  assert.match(source, /event: campaign-change/);
  assert.match(source, /changedAt/);
  assert.doesNotMatch(source, /event: campaign-change\\ndata: \$\{JSON\.stringify\(\{[\s\S]*eventType:/);
  assert.match(source, /clearInterval\(heartbeat\);[\s\S]*unsubscribe\(\);/);
});
