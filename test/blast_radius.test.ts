import assert from "node:assert/strict";
import test from "node:test";
import { buildExposureRecords, incidentRequestSchema } from "../src/key_incident.ts";

test("the blast radius includes assets, live events, and moderation work", () => {
  const input = incidentRequestSchema.parse({
    incidentId: "incident-77",
    projectId: "arena",
    graceHours: 2,
    playerAssets: [{ assetId: "asset-1", playerId: "player-1", kind: "map" }],
    liveEvents: [{ eventId: "event-2", region: "eu" }],
    moderationQueue: [
      { queueItemId: "queue-3", assetId: "asset-1", state: "queued" }
    ]
  });

  assert.deepEqual(buildExposureRecords(input), [
    { resourceType: "player_asset", resourceId: "asset-1", incidentId: "incident-77" },
    { resourceType: "live_event", resourceId: "event-2", incidentId: "incident-77" },
    { resourceType: "moderation_queue_item", resourceId: "queue-3", incidentId: "incident-77" }
  ]);
});
