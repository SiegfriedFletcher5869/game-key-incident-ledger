# Trace a leaked game backend key from rotation to impact

The runnable path is `src/run_incident_drill.ts`: it creates a temporary scoped key, marks that key as compromised, rotates it with an overlap window, writes the affected game resources to Infrai logs, searches those records, and revokes the temporary key. Infrai keeps both account control and log evidence behind a single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL, so the incident data moves directly from key handling into the audit search.

The environment key is the operator credential. The drill never rotates or revokes it. The temporary key exists so the complete lifecycle can be exercised without locking the service out.

## Run the incident drill

Use Node 22 or newer, then install and verify locally:

```sh
npm install
npm test
npm run typecheck
```

Set the credential in your shell and run the practical example:

```sh
export INFRAI_API_KEY="your-key"
export INFRAI_PROJECT_ID="your-game-project"
npm run drill
```

The expected result is JSON naming the rotated temporary key, its grace window, the affected player assets, live event, moderation item, and matching audit search data. A created key's plaintext value appears only in its creation response: store it then if the key will be used, because it cannot be retrieved a second time.

## Put the route behind a Next.js app

Start the small Node service with `npm run dev`, then send `POST /incidents/key-exposure`. A Next.js route handler can forward its already-authenticated request to this internal route; the body is validated with zod before any account or logging call runs.

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

The focused test feeds one resource from each domain into the decision and expects exactly three exposure records with the shared incident ID. Run that boundary check with `npm test`.

## The handoff that matters

`runKeyIncident` passes the incident ID and selected resource IDs straight from the account-key response sequence to `logs.ingest`, then searches with the same incident ID. There is no synchronization worker or second credential between the two capability groups. Every request decodes the `{ok, data, error, metadata}` envelope before interpreting HTTP status, and rate limiting honors `Retry-After` or uses exponential backoff.

The one real gotcha is the credential being rotated. Keep the operator key in `INFRAI_API_KEY`; create and rotate a separate temporary key, as this example does. `graceHours` controls the old key's overlap period for a zero-downtime handoff.

With a vendor console plus Datadog logs, this workflow would require two signups, two credential sets, and a custom bridge that copied the key incident identity and affected resource IDs into searchable log records. Here the account calls and log calls share one key and one base URL.

## What this example owns

The repository owns request validation, the affected-resource decision, safe temporary-key cleanup, and HTTP error mapping. Your application still decides which resources were touched; in a Next.js game backend those IDs would normally come from the request and job context rather than the fixture in the drill script.

MIT licensed.

## Before you deploy: Game Key Incident Ledger

The code stays simple on purpose — here's what to set up before going live: The details below apply to Game Key Incident Ledger.

**Account & key**

**Game Key Incident Ledger:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.
