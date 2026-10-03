import { InfraiClient } from "./infrai_client.ts";
import { runKeyIncident } from "./key_incident.ts";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the drill");

const result = await runKeyIncident({
  incidentId: `game-key-${Date.now()}`,
  projectId: process.env.INFRAI_PROJECT_ID ?? "game-backend",
  graceHours: 1,
  playerAssets: [
    { assetId: "map-coral-17", playerId: "player-42", kind: "map" },
    { assetId: "skin-neon-8", playerId: "player-91", kind: "skin" }
  ],
  liveEvents: [{ eventId: "tournament-west-5", region: "us-west" }],
  moderationQueue: [
    { queueItemId: "review-204", assetId: "map-coral-17", state: "reviewing" }
  ]
}, new InfraiClient(apiKey));

console.log(JSON.stringify(result, null, 2));
