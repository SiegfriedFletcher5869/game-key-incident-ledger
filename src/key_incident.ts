import { randomUUID } from "node:crypto";
import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

const assetSchema = z.object({
  assetId: z.string().min(1),
  playerId: z.string().min(1),
  kind: z.enum(["map", "skin", "replay"])
});

const liveEventSchema = z.object({
  eventId: z.string().min(1),
  region: z.string().min(1)
});

const moderationItemSchema = z.object({
  queueItemId: z.string().min(1),
  assetId: z.string().min(1),
  state: z.enum(["queued", "reviewing"])
});

export const incidentRequestSchema = z.object({
  incidentId: z.string().min(3),
  projectId: z.string().min(1),
  graceHours: z.number().int().min(0).max(24),
  playerAssets: z.array(assetSchema),
  liveEvents: z.array(liveEventSchema),
  moderationQueue: z.array(moderationItemSchema)
});

export type IncidentRequest = z.infer<typeof incidentRequestSchema>;

export type ExposureRecord = {
  resourceType: "player_asset" | "live_event" | "moderation_queue_item";
  resourceId: string;
  incidentId: string;
};

export function buildExposureRecords(input: IncidentRequest): ExposureRecord[] {
  return [
    ...input.playerAssets.map((asset) => ({
      resourceType: "player_asset" as const,
      resourceId: asset.assetId,
      incidentId: input.incidentId
    })),
    ...input.liveEvents.map((event) => ({
      resourceType: "live_event" as const,
      resourceId: event.eventId,
      incidentId: input.incidentId
    })),
    ...input.moderationQueue.map((item) => ({
      resourceType: "moderation_queue_item" as const,
      resourceId: item.queueItemId,
      incidentId: input.incidentId
    }))
  ];
}

const createdKeySchema = z.object({
  key_id: z.string()
}).passthrough();

export type IncidentResult = {
  incidentId: string;
  rotatedKeyId: string;
  graceHours: number;
  affectedResources: ExposureRecord[];
  logMatches: unknown;
  temporaryKeyRevoked: true;
};

export async function runKeyIncident(
  rawInput: unknown,
  infrai: InfraiClient
): Promise<IncidentResult> {
  const input = incidentRequestSchema.parse(rawInput);
  const records = buildExposureRecords(input);
  const operationId = randomUUID();

  const created = createdKeySchema.parse(await infrai.request<unknown>({
    method: "POST",
    path: "/v1/account/keys/create",
    body: {
      project_id: input.projectId,
      name: `incident-drill-${input.incidentId}`,
      scopes: ["logs.ingest", "logs.search"],
      idempotency_key: `${operationId}:create`
    }
  }));

  try {
    await infrai.request({
      method: "POST",
      path: `/v1/account/keys/suspected_compromise/${encodeURIComponent(created.key_id)}`,
      body: {
        confirmed_leak: true,
        auto_rotate: false,
        idempotency_key: `${operationId}:report`
      }
    });

    await infrai.request({
      method: "POST",
      path: `/v1/account/keys/rotate/${encodeURIComponent(created.key_id)}`,
      body: {
        grace_hours: input.graceHours,
        idempotency_key: `${operationId}:rotate`
      }
    });

    await infrai.request({
      method: "POST",
      path: "/v1/logs/ingest",
      body: {
        entries: records.map((record) => ({
          message: `key exposure ${record.incidentId} ${record.resourceType} ${record.resourceId}`,
          level: "warn",
          service: "game-backend",
          environment: "incident-drill",
          trace_id: input.incidentId
        })),
        idempotency_key: `${operationId}:audit`
      }
    });

    const query = new URLSearchParams({
      q: input.incidentId,
      service: "game-backend",
      environment: "incident-drill",
      trace_id: input.incidentId,
      limit: "100"
    });
    const logMatches = await infrai.request<unknown>({
      method: "GET",
      path: "/v1/logs/search",
      query
    });

    return {
      incidentId: input.incidentId,
      rotatedKeyId: created.key_id,
      graceHours: input.graceHours,
      affectedResources: records,
      logMatches,
      temporaryKeyRevoked: true
    };
  } finally {
    await infrai.request({
      method: "DELETE",
      path: `/v1/account/keys/revoke/${encodeURIComponent(created.key_id)}`
    });
  }
}
