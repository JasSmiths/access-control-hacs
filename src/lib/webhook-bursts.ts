import "server-only";

import { getDb } from "./db";
import { ContractorRow, ingestEvent } from "./sessions";
import { isAutoEvent, normalisePlate, WebhookPayload } from "./webhook";

const BURST_WINDOW_MS = 10_000;

type BurstRow = {
  id: number;
  source: string;
  first_received_at: string;
  last_received_at: string;
  expires_at: string;
  status: "pending" | "processed" | "ignored";
  chosen_candidate_id: number | null;
  chosen_contractor_id: number | null;
  chosen_plate: string | null;
  event_type: "enter" | "exit" | null;
  gate_event_id: number | null;
  processed_at: string | null;
};

type CandidateRow = {
  id: number;
  burst_id: number;
  ingest_key: string | null;
  source: string;
  device_id: string | null;
  event_id: string | null;
  plate_raw: string;
  plate_normalized: string;
  occurred_at: string;
  received_at: string;
  event_type: string;
  contractor_id: number | null;
  is_known: number;
  was_selected: number;
};

type FinalizedBurst = {
  burstId: number;
  status: "pending" | "processed" | "ignored";
  gateEventId: number | null;
  contractorId: number | null;
  chosenPlate: string | null;
  eventType: "enter" | "exit" | null;
  chosenCandidateId: number | null;
};

type RegisteredCandidate = {
  burstId: number;
  candidateId: number;
  source: string;
  plate: string;
  contractor: ContractorRow | undefined;
  duplicateIngestKey: boolean;
  duplicateCandidateId: number | null;
  eventId: string | null;
  deviceId: string | null;
};

function addMs(iso: string, ms: number) {
  return new Date(Date.parse(iso) + ms).toISOString();
}

function getOpenSessionId(contractorId: number): number | null {
  const row = getDb()
    .prepare(
      "SELECT id FROM sessions WHERE contractor_id = ? AND status = 'open' LIMIT 1"
    )
    .get(contractorId) as { id: number } | undefined;
  return row?.id ?? null;
}

function findContractorById(contractorId: number): ContractorRow | undefined {
  return getDb()
    .prepare("SELECT * FROM contractors WHERE id = ? LIMIT 1")
    .get(contractorId) as ContractorRow | undefined;
}

function loadBurst(burstId: number): BurstRow | undefined {
  return getDb()
    .prepare("SELECT * FROM webhook_bursts WHERE id = ? LIMIT 1")
    .get(burstId) as BurstRow | undefined;
}

function loadBurstCandidates(burstId: number): CandidateRow[] {
  return getDb()
    .prepare(
      `SELECT *
         FROM webhook_burst_candidates
        WHERE burst_id = ?
        ORDER BY is_known DESC, received_at DESC, id DESC`
    )
    .all(burstId) as CandidateRow[];
}

function findActiveBurstForSource(source: string, receivedAt: string): BurstRow | undefined {
  return getDb()
    .prepare(
      `SELECT *
         FROM webhook_bursts
        WHERE source = ?
          AND expires_at >= ?
        ORDER BY id DESC
        LIMIT 1`
    )
    .get(source, receivedAt) as BurstRow | undefined;
}

function findCandidateByIngestKeyAndPlate(
  ingestKey: string,
  plate: string
): CandidateRow | undefined {
  return getDb()
    .prepare(
      `SELECT *
         FROM webhook_burst_candidates
        WHERE ingest_key = ?
          AND plate_normalized = ?
        LIMIT 1`
    )
    .get(ingestKey, plate) as CandidateRow | undefined;
}

function finalizeExpiredPendingBursts(nowIso = new Date().toISOString()) {
  const rows = getDb()
    .prepare(
      `SELECT id
         FROM webhook_bursts
        WHERE status = 'pending'
          AND expires_at <= ?`
    )
    .all(nowIso) as Array<{ id: number }>;

  for (const row of rows) {
    finalizeBurst(row.id);
  }
}

function registerCandidate(args: {
  payload: WebhookPayload;
  ingestKey: string | null;
  contractor: ContractorRow | undefined;
}): RegisteredCandidate {
  const db = getDb();
  const source = args.payload.source ?? "unknown";
  const plate = normalisePlate(args.payload.plate);
  const receivedAt = new Date().toISOString();

  finalizeExpiredPendingBursts(receivedAt);

  if (args.ingestKey) {
    const existing = findCandidateByIngestKeyAndPlate(args.ingestKey, plate);
    if (existing) {
      return {
        burstId: existing.burst_id,
        candidateId: existing.id,
        source,
        plate,
        contractor: args.contractor,
        duplicateIngestKey: true,
        duplicateCandidateId: existing.id,
        eventId: args.payload.event_id ?? null,
        deviceId: args.payload.device_id ?? null,
      };
    }
  }

  const result = db.transaction(() => {
    let burst = findActiveBurstForSource(source, receivedAt);

    if (!burst) {
      const insertBurst = db
        .prepare(
          `INSERT INTO webhook_bursts (source, first_received_at, last_received_at, expires_at)
           VALUES (?, ?, ?, ?)`
        )
        .run(source, receivedAt, receivedAt, addMs(receivedAt, BURST_WINDOW_MS));
      burst = loadBurst(Number(insertBurst.lastInsertRowid));
      if (!burst) {
        throw new Error("Failed to create webhook burst");
      }
    } else if (burst.status === "pending") {
      db.prepare(
        `UPDATE webhook_bursts
            SET last_received_at = ?
          WHERE id = ?`
      ).run(receivedAt, burst.id);
      burst = loadBurst(burst.id);
      if (!burst) {
        throw new Error("Failed to refresh webhook burst");
      }
    }

    const insertCandidate = db
      .prepare(
        `INSERT INTO webhook_burst_candidates (
           burst_id, ingest_key, source, device_id, event_id, plate_raw, plate_normalized,
           occurred_at, received_at, event_type, contractor_id, is_known
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        burst.id,
        args.ingestKey,
        source,
        args.payload.device_id ?? null,
        args.payload.event_id ?? null,
        args.payload.plate,
        plate,
        new Date(args.payload.timestamp).toISOString(),
        receivedAt,
        args.payload.event,
        args.contractor?.id ?? null,
        args.contractor ? 1 : 0
      );

    return {
      burstId: burst.id,
      candidateId: Number(insertCandidate.lastInsertRowid),
      source,
      plate,
      contractor: args.contractor,
      duplicateIngestKey: false,
      duplicateCandidateId: null,
      eventId: args.payload.event_id ?? null,
      deviceId: args.payload.device_id ?? null,
    } satisfies RegisteredCandidate;
  })();

  return result;
}

function resolveEventType(candidate: CandidateRow): "enter" | "exit" {
  if (!isAutoEvent({ event: candidate.event_type as "enter" | "exit" } as WebhookPayload)) {
    return candidate.event_type as "enter" | "exit";
  }
  if (!candidate.contractor_id) {
    throw new Error("Auto event candidate cannot be resolved without a contractor");
  }
  return getOpenSessionId(candidate.contractor_id) ? "exit" : "enter";
}

function finalizeBurst(burstId: number): FinalizedBurst {
  const db = getDb();

  return db.transaction(() => {
    const burst = loadBurst(burstId);
    if (!burst) {
      throw new Error("Webhook burst not found");
    }

    if (burst.status !== "pending") {
      return {
        burstId: burst.id,
        status: burst.status as FinalizedBurst["status"],
        gateEventId: burst.gate_event_id,
        contractorId: burst.chosen_contractor_id,
        chosenPlate: burst.chosen_plate,
        eventType: burst.event_type,
        chosenCandidateId: burst.chosen_candidate_id,
      } satisfies FinalizedBurst;
    }

    const candidates = loadBurstCandidates(burst.id);
    const chosen = candidates.find((candidate) => candidate.is_known === 1);

    if (!chosen || !chosen.contractor_id) {
      db.prepare(
        `UPDATE webhook_bursts
            SET status = 'ignored',
                processed_at = ?
          WHERE id = ?`
      ).run(new Date().toISOString(), burst.id);

      return {
        burstId: burst.id,
        status: "ignored" as const,
        gateEventId: null,
        contractorId: null,
        chosenPlate: null,
        eventType: null,
        chosenCandidateId: null,
      } satisfies FinalizedBurst;
    }

    const contractor = findContractorById(chosen.contractor_id);
    if (!contractor) {
      db.prepare(
        `UPDATE webhook_bursts
            SET status = 'ignored',
                processed_at = ?
          WHERE id = ?`
      ).run(new Date().toISOString(), burst.id);

      return {
        burstId: burst.id,
        status: "ignored" as const,
        gateEventId: null,
        contractorId: null,
        chosenPlate: null,
        eventType: null,
        chosenCandidateId: null,
      } satisfies FinalizedBurst;
    }

    const eventType = resolveEventType(chosen);
    const ingested = ingestEvent({
      contractorId: contractor.id,
      plateRaw: chosen.plate_raw,
      eventType,
      occurredAt: chosen.occurred_at,
      source: burst.source,
      ingestKey: `burst:${burst.id}`,
      contractor,
    });

    db.prepare(
      `UPDATE webhook_bursts
          SET status = 'processed',
              chosen_candidate_id = ?,
              chosen_contractor_id = ?,
              chosen_plate = ?,
              event_type = ?,
              gate_event_id = ?,
              processed_at = ?
        WHERE id = ?`
    ).run(
      chosen.id,
      contractor.id,
      chosen.plate_normalized,
      eventType,
      ingested.eventId,
      new Date().toISOString(),
      burst.id
    );

    db.prepare(
      `UPDATE webhook_burst_candidates
          SET was_selected = CASE WHEN id = ? THEN 1 ELSE 0 END
        WHERE burst_id = ?`
    ).run(chosen.id, burst.id);

    return {
      burstId: burst.id,
      status: "processed" as const,
      gateEventId: ingested.eventId,
      contractorId: contractor.id,
      chosenPlate: chosen.plate_normalized,
      eventType,
      chosenCandidateId: chosen.id,
    } satisfies FinalizedBurst;
  })();
}

export async function resolveWebhookBurst(args: {
  payload: WebhookPayload;
  ingestKey: string | null;
  contractor: ContractorRow | undefined;
}) {
  const registered = registerCandidate(args);
  const burst = loadBurst(registered.burstId);
  if (!burst) {
    throw new Error("Webhook burst disappeared before resolution");
  }

  if (registered.contractor) {
    const finalized = finalizeBurst(registered.burstId);
    return {
      ...registered,
      finalized,
    };
  }
  return {
    ...registered,
    finalized: {
      burstId: burst.id,
      status: burst.status,
      gateEventId: burst.gate_event_id,
      contractorId: burst.chosen_contractor_id,
      chosenPlate: burst.chosen_plate,
      eventType: burst.event_type,
      chosenCandidateId: burst.chosen_candidate_id,
    } satisfies FinalizedBurst,
  };
}
