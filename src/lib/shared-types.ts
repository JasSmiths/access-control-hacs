export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type JsonObject = {
  [key: string]: JsonValue;
};

export type LogLevel = "debug" | "info" | "error";

export type ActiveApiStream = {
  id: string;
  actor: string;
  connected_at: string;
  ip: string | null;
  ip_source: string | null;
  forwarded_chain: string[];
  user_agent: string | null;
  path: string;
  bytes_in: number;
  bytes_out: number;
};

export type LogRow = {
  id: number;
  occurred_at: string;
  level: LogLevel;
  category: string;
  action: string;
  message: string;
  ip: string | null;
  method: string | null;
  path: string | null;
  actor: string | null;
  contractor_id: number | null;
  plate: string | null;
  device_id: string | null;
  device_name: string | null;
  event_id: string | null;
  details_json: string | null;
};

export type LogsPageResult = {
  rows: LogRow[];
  count: number;
  page: number;
  pageSize: number;
  logSizeBytes: number;
};

export type LogsPageData = LogsPageResult & {
  streams: ActiveApiStream[];
};

export type BusEventPayloadMap = {
  "session.opened": {
    sessionId: number;
    contractorId: number;
    startedAt: string;
  };
  "session.closed": {
    sessionId: number;
    contractorId: number;
    startedAt: string;
    endedAt: string;
    durationSeconds: number;
  };
  "session.flagged": {
    sessionId: number;
    contractorId: number;
    reason: string;
  };
  "contractor.updated": {
    contractorId: number;
  };
  "log.created": {
    id: number;
  };
  "stream.transfer_test": {
    id: string;
    chunk_bytes: number;
    chunks: number;
  };
};

export type BusEventName = keyof BusEventPayloadMap;

export type BusEvent = {
  [Name in BusEventName]: {
    name: Name;
    data: BusEventPayloadMap[Name];
  };
}[BusEventName];
