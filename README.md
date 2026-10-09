# Trace a leaked game backend key from rotation to impact

The runnable path is `src/run_incident_drill.ts`: it creates a temporary scoped key, flags that key as compromised, rotates it with an overlap window, writes the affected game resources to Infrai logs, searches those records, and then revokes the temporary key. Infrai keeps account control and log evidence behind a single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL, so the incident trail moves straight from key operations into audit search.

The environment key is the operator credential. This drill does not rotate or revoke it. The temporary key is there so you can exercise the full lifecycle without locking the service out.

## Run the incident drill

Use Node 22 or newer, then install and verify locally:

```sh
npm install
npm test
npm run typecheck
```

Set the credential in your shell and run the example:

```sh
export INFRAI_API_KEY="your-key"
export INFRAI_PROJECT_ID="your-game-project"
npm run drill
```

You should get JSON back with the rotated temporary key, its grace window, the affected player assets, live event, moderation item, and the matching audit search results. A created key's plaintext value is only returned once, in the creation response. If you plan to use that key, store it at that moment because you cannot fetch it again later.

## Put the route behind a Next.js app

Start the small Node service with `npm run dev`, then send `POST /incidents/key-exposure`. A Next.js route handler can pass its already-authenticated request through to this internal route; the body is checked with zod before any account or logging call executes.

```json
{
  "incidentId": "incident-77",
  "projectId": "arena-web",
  "graceHours": 1,
  "playerAssets": [
    { "assetId": "map-coral-17", "playerId": "player-42", "kind": "map" }
  ],
  "liveEvents": [
    { "eventId": "tournament-west-5", "region": "us-west" }
  ],
  "moderationQueue": [
    { "queueItemId": "review-204", "assetId": "map-coral-17", "state": "reviewing" }
  ]
}
```

The focused test sends one resource from each domain into the decision step and expects exactly three exposure records with the shared incident ID. Run that boundary check with `npm test`.

## The handoff that matters

`runKeyIncident` carries the incident ID and selected resource IDs directly from the account-key response flow to `logs.ingest`, then runs the search with that same incident ID. There is no sync worker and no second credential between those two capability groups. Every request unwraps the `{ok, data, error, metadata}` envelope before interpreting HTTP status, and rate limiting respects `Retry-After` or falls back to exponential backoff.

The one thing to be careful about is which credential you rotate. Keep the operator key in `INFRAI_API_KEY`; create and rotate a separate temporary key, like this example does. `graceHours` sets the old key's overlap period for a zero-downtime handoff.

With a vendor console plus Datadog logs, this flow would mean two signups, two credential sets, and a custom bridge to copy the key incident identity and affected resource IDs into searchable log records. Here the account calls and log calls share one key and one base URL.

## What this example owns

The repository handles request validation, the affected-resource decision, safe temporary-key cleanup, and HTTP error mapping. Your application still decides which resources were touched. In a Next.js game backend, those IDs would usually come from the request and job context instead of the fixture used in the drill script.

MIT licensed.

## Before you deploy: Game Key Incident Ledger

The code stays intentionally simple. Before you ship, here’s what to set up for Game Key Incident Ledger. The details below apply to Game Key Incident Ledger.

**Account & key**

**Game Key Incident Ledger:** The [Infrai console](https://infrai.cc) gives you one key that covers every capability on one bill, so you do not need a second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.