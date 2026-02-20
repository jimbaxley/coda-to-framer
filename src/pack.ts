import * as coda from "@codahq/packs-sdk";

declare function setTimeout(handler: (...args: unknown[]) => void, timeout?: number): unknown;

export const pack = coda.newPack();

pack.addNetworkDomain("vercel.app");

type WorkerResponse = {
  accepted?: boolean;
  deduped?: boolean;
  jobId?: string;
  requestId?: string;
  status?: string;
  success?: boolean;
  message?: string;
  published?: boolean;
  deploymentId?: string;
};

type JobEvent = {
  at?: string;
  level?: string;
  stage?: string;
  message?: string;
  details?: Record<string, unknown>;
};

type SyncJob = {
  jobId?: string;
  requestId?: string;
  idempotencyKey?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  completedAt?: string;
  result?: {
    success?: boolean;
    published?: boolean;
    deploymentId?: string;
    itemsAdded?: number;
    itemsRemoved?: number;
    message?: string;
  } | null;
  error?: string | null;
  payload?: {
    action?: string;
    docId?: string;
    tableIdOrName?: string;
    rowId?: string;
    collectionName?: string;
    publish?: boolean;
  };
  events?: JobEvent[];
};

function createRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeIdempotencyKey(requestId: string) {
  return `idem_${requestId}`;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJobId(text: string) {
  const match = text.match(/job:\s*([a-zA-Z0-9-]+)/i);
  return match?.[1] || "";
}

function isSyncTerminalStatus(text: string) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized.includes("⏳") || normalized.includes("queued") || normalized.includes("running") || normalized.includes("delayed")) {
    return false;
  }

  if (normalized.includes("✅") || normalized.includes("❌") || normalized.includes("failed") || normalized.includes("complete") || normalized.includes("published") || normalized.includes("succeeded")) {
    return true;
  }

  return false;
}

function normalizeSyncStatus(text: string) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  if (normalized.includes("failed") || normalized.includes("❌")) {
    return "failed";
  }

  if (
    normalized.includes("published")
    || normalized.includes("succeeded")
    || normalized.includes("complete")
    || normalized.includes("✅")
  ) {
    return "succeeded";
  }

  if (normalized.includes("running") || normalized.includes("delayed")) {
    return "running";
  }

  if (normalized.includes("queued") || normalized.includes("pending") || normalized.includes("⏳")) {
    return "pending";
  }

  return "unknown";
}

function normalizeCallbackColumnName(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  const directBracket = text.match(/^thisRow\.\[([^\]]+)\]$/i);
  if (directBracket?.[1]) {
    return directBracket[1].trim();
  }
  const directDot = text.match(/^thisRow\.([A-Za-z0-9 _-]+)$/i);
  if (directDot?.[1]) {
    return directDot[1].trim();
  }
  return text;
}

function extractCodaIdFromText(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";

  const rowMatch = text.match(/(?:\/rows\/|\b)(i-[A-Za-z0-9_-]+)\b/);
  if (rowMatch?.[1]) return rowMatch[1];

  const tableMatch = text.match(/\b(grid-[A-Za-z0-9_-]+)\b/);
  if (tableMatch?.[1]) return tableMatch[1];

  const columnMatch = text.match(/\b(c-[A-Za-z0-9_-]+)\b/);
  if (columnMatch?.[1]) return columnMatch[1];

  return "";
}

function coerceReferenceString(
  value: unknown,
  preferredKeys: string[] = [],
  options: {
    includeRowId?: boolean;
    traverseArrayItems?: boolean;
  } = {},
): string {
  const includeRowId = options.includeRowId !== false;
  const traverseArrayItems = options.traverseArrayItems !== false;

  if (value === null || value === undefined) return "";

  if (Array.isArray(value)) {
    const arrayText = String(value).trim();
    if (arrayText && !looksLikeUnknownObjectText(arrayText)) {
      const extracted = extractCodaIdFromText(arrayText);
      if (extracted && (includeRowId || !/^i-/.test(extracted))) {
        return extracted;
      }
      if (!arrayText.includes("[object Object]") && !arrayText.includes("[unknown object]")) {
        return arrayText;
      }
    }

    if (!traverseArrayItems) {
      return "";
    }

    for (const item of value) {
      const normalized = coerceReferenceString(item, preferredKeys, options);
      if (normalized) return normalized;
    }
    return "";
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const genericKeys = [
      "tableId",
      "tableName",
      "table",
      "columnId",
      "id",
      "name",
      "displayValue",
      "value",
      "href",
      "browserLink",
      "link",
      "url",
    ];
    if (includeRowId) {
      genericKeys.unshift("rowId");
    }
    const keys = [...preferredKeys, ...genericKeys];
    for (const key of keys) {
      if (key in obj) {
        const normalized = coerceReferenceString(obj[key], preferredKeys, options);
        if (normalized) return normalized;
      }
    }

    for (const nested of Object.values(obj)) {
      const normalized = coerceReferenceString(nested, preferredKeys, options);
      if (normalized) return normalized;
    }

    return "";
  }

  const text = String(value).trim();
  const extracted = extractCodaIdFromText(text);
  if (extracted && (includeRowId || !/^i-/.test(extracted))) {
    return extracted;
  }
  return text;
}

function looksLikeSyncStatusText(value: string) {
  const text = String(value || "").trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("job:")
    || lower.startsWith("sync ")
    || text.includes("⏳")
    || text.includes("✅")
    || text.includes("❌")
  );
}

function looksLikeUnknownObjectText(value: string) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  return text.includes("[unknown object]") || text === "[object object]";
}

function isLikelyUrl(value: string) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function looksLikeCodaRowUrl(value: string) {
  const text = String(value || "").trim();
  return /coda\.io\/d\/.+\/rows\//i.test(text) || /\/rows\/i-[A-Za-z0-9_-]+/i.test(text);
}

function normalizeCallbackTableNameOrId(value: unknown, fallback = "") {
  const text = coerceReferenceString(
    value,
    ["tableId", "tableName", "table", "id", "name", "displayValue", "value"],
    {
      includeRowId: false,
      traverseArrayItems: false,
    },
  ) || coerceReferenceString(
    value,
    ["tableId", "tableName", "table", "id", "name", "displayValue", "value"],
    {
      includeRowId: false,
      traverseArrayItems: true,
    },
  );
  if (!text || looksLikeSyncStatusText(text) || looksLikeUnknownObjectText(text)) {
    return fallback;
  }
  if (/^i-[A-Za-z0-9_-]+$/.test(text)) {
    return fallback;
  }
  const bracketed = text.match(/^\[([^\]]+)\]$/);
  if (bracketed?.[1]) {
    return bracketed[1].trim();
  }
  return text;
}

function normalizeCallbackRowSelector(value: unknown) {
  const text = coerceReferenceString(value, ["rowId", "id", "name", "displayValue", "value", "url"]);
  if (!text || looksLikeSyncStatusText(text) || looksLikeUnknownObjectText(text)) {
    return "";
  }
  if (isLikelyUrl(text) && !looksLikeCodaRowUrl(text)) {
    return "";
  }
  return text;
}

function normalizeCallbackColumnNameOrId(value: unknown, fallback = "") {
  const text = normalizeCallbackColumnName(
    coerceReferenceString(value, ["columnId", "id", "name", "displayValue", "value"]),
  );
  if (!text || looksLikeSyncStatusText(text) || looksLikeUnknownObjectText(text)) {
    return fallback;
  }
  // If caller passed a raw UUID-like identifier (frontend/internal id),
  // treat it as invalid for server-side column resolution so we fall back
  // to the default column name (e.g. "Status" or "Response").
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F\-]{25,}$/.test(text)) {
    return fallback;
  }
  return text;
}

async function runSyncRequest(
  workerUrl: string,
  payload: Record<string, unknown>,
  context: coda.ExecutionContext,
): Promise<WorkerResponse> {
  const maxAttempts = 3;
  const baseDelayMs = 500;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await context.fetcher.fetch({
        method: "POST",
        url: workerUrl,
        cacheTtlSecs: 0,
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = (response.body ?? {}) as WorkerResponse;
      if (response.status >= 400) {
        if (attempt < maxAttempts && isRetryableStatus(response.status)) {
          await wait(baseDelayMs * attempt);
          continue;
        }
        throw new coda.UserVisibleError(result.message || `Request failed (${response.status})`);
      }

      return result;
    } catch (error) {
      if (error instanceof coda.UserVisibleError) {
        throw error;
      }
      lastError = error;
      if (attempt < maxAttempts) {
        await wait(baseDelayMs * attempt);
        continue;
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError || "Unknown error");
  throw new coda.UserVisibleError(`Sync failed: ${message}`);
}

async function getSyncStatus(
  workerUrl: string,
  jobId: string,
  context: coda.ExecutionContext,
): Promise<string> {
  try {
    const response = await context.fetcher.fetch({
      method: "GET",
      url: `${workerUrl}?jobId=${encodeURIComponent(jobId)}`,
      cacheTtlSecs: 0,
    });

    if (response.status >= 400) {
      const message = (response.body as { message?: string } | undefined)?.message;
      throw new coda.UserVisibleError(message || `Status request failed (${response.status})`);
    }

    const body = (response.body ?? {}) as {
      success?: boolean;
      job?: {
        status?: string;
        result?: {
          message?: string;
        };
      };
    };

    const status = body.job?.status || "unknown";
    const terminalMessage = body.job?.result?.message;
    if (status === "failed") {
      return terminalMessage || `Sync ❌ Failed (job: ${jobId})`;
    }
    if (status === "succeeded" || status === "published") {
      return terminalMessage || `Sync ✅ Complete (job: ${jobId})`;
    }

    return `Sync ⏳ ${status} (job: ${jobId})`;
  } catch (error) {
    if (error instanceof coda.UserVisibleError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new coda.UserVisibleError(`Status check failed: ${message}`);
  }
}

async function getSyncLogPage(
  workerUrl: string,
  limit: number,
  continuation: coda.Continuation | undefined,
  context: coda.ExecutionContext,
): Promise<coda.GenericSyncFormulaResult> {
  const cursor = String(continuation?.cursor || "0");
  const response = await context.fetcher.fetch({
    method: "GET",
    url: `${workerUrl}?mode=list&limit=${encodeURIComponent(String(limit))}&cursor=${encodeURIComponent(cursor)}`,
    cacheTtlSecs: 0,
  });

  if (response.status >= 400) {
    const message = (response.body as { message?: string } | undefined)?.message;
    throw new coda.UserVisibleError(message || `Sync log request failed (${response.status})`);
  }

  const body = (response.body ?? {}) as {
    jobs?: SyncJob[];
    continuation?: {
      cursor?: string;
    } | null;
  };

  const rows = (body.jobs || []).map((job) => {
    const latestEvent = Array.isArray(job.events) && job.events.length > 0
      ? job.events[job.events.length - 1]
      : undefined;
    return {
      id: job.jobId || "",
      jobId: job.jobId || "",
      requestId: job.requestId || "",
      status: job.status || "unknown",
      action: job.payload?.action || "sync",
      sourceTable: String(job.payload?.tableIdOrName || ""),
      collectionName: String(job.payload?.collectionName || ""),
      publishRequested: Boolean(job.payload?.publish),
      success: Boolean(job.result?.success),
      published: Boolean(job.result?.published),
      deploymentId: job.result?.deploymentId || "",
      itemsAdded: Number(job.result?.itemsAdded || 0),
      itemsRemoved: Number(job.result?.itemsRemoved || 0),
      message: job.result?.message || "",
      error: job.error || "",
      latestStage: latestEvent?.stage || "",
      latestEvent: latestEvent?.message || "",
      createdAt: job.createdAt || "",
      startedAt: job.startedAt || "",
      completedAt: job.completedAt || "",
      updatedAt: job.updatedAt || "",
    };
  });

  return {
    result: rows,
    continuation: body.continuation?.cursor
      ? { cursor: body.continuation.cursor }
      : undefined,
  };
}

pack.addSyncTable({
  name: "FramerSyncLog",
  identityName: "FramerSyncJob",
  description: "Sync recent Framer sync jobs from the worker endpoint",
  schema: coda.makeObjectSchema({
    properties: {
      id: { type: coda.ValueType.String, required: true },
      jobId: { type: coda.ValueType.String },
      requestId: { type: coda.ValueType.String },
      status: { type: coda.ValueType.String },
      action: { type: coda.ValueType.String },
      sourceTable: { type: coda.ValueType.String },
      collectionName: { type: coda.ValueType.String },
      publishRequested: { type: coda.ValueType.Boolean },
      success: { type: coda.ValueType.Boolean },
      published: { type: coda.ValueType.Boolean },
      deploymentId: { type: coda.ValueType.String },
      itemsAdded: { type: coda.ValueType.Number },
      itemsRemoved: { type: coda.ValueType.Number },
      message: { type: coda.ValueType.String },
      error: { type: coda.ValueType.String },
      latestStage: { type: coda.ValueType.String },
      latestEvent: { type: coda.ValueType.String },
      createdAt: { type: coda.ValueType.String, codaType: coda.ValueHintType.DateTime },
      startedAt: { type: coda.ValueType.String, codaType: coda.ValueHintType.DateTime },
      completedAt: { type: coda.ValueType.String, codaType: coda.ValueHintType.DateTime },
      updatedAt: { type: coda.ValueType.String, codaType: coda.ValueHintType.DateTime },
    },
    idProperty: "id",
    displayProperty: "jobId",
  }),
  formula: {
    name: "SyncFramerSyncLog",
    description: "Sync recent jobs from the async worker endpoint",
    parameters: [
      coda.makeParameter({
        type: coda.ParameterType.String,
        name: "workerUrl",
        description: "Sync endpoint URL (e.g., https://coda-to-framer-node.vercel.app/api/sync)",
      }),
      coda.makeParameter({
        type: coda.ParameterType.Number,
        name: "pageSize",
        description: "Rows per page (default 50, max 200)",
        optional: true,
      }),
    ],
    execute: async ([workerUrl, pageSize], context) => {
      const limit = Math.max(1, Math.min(200, Number(pageSize || 50)));
      return getSyncLogPage(workerUrl, limit, context.sync.continuation, context);
    },
  },
});

// new: table for listing Framer collections
pack.addSyncTable({
  name: "FramerCollections",
  identityName: "FramerCollection",
  description: "List all managed Collections in a Framer project through the worker",
  schema: coda.makeObjectSchema({
    idProperty: "id",
    displayProperty: "name",
    properties: {
      id: { type: coda.ValueType.String, required: true },
      name: { type: coda.ValueType.String },
      // raw `fields` array from Framer; item schema left unspecified so users can open details
      fields: { type: coda.ValueType.Array, items: { type: coda.ValueType.Object, properties: {} } },
      raw: { type: coda.ValueType.Object, properties: {} },
    },
  }),
  formula: {
    name: "ListFramerCollections",
    description: "Retrieve all collections from a Framer project (worker must support /api/collections)",
    parameters: [
      coda.makeParameter({
        type: coda.ParameterType.String,
        name: "workerUrl",
        description: "Sync endpoint URL (e.g., https://coda-to-framer-node.vercel.app)",
      }),
      coda.makeParameter({
        type: coda.ParameterType.String,
        name: "framerProjectUrl",
        description: "Framer project URL (e.g., https://framer.com/projects/abc123)",
      }),
    ],
    execute: async ([workerUrl, projectUrl], context) => {
      // normalize workerUrl: strip trailing slashes and remove /api/sync
      let base = String(workerUrl || "").trim();
      base = base.replace(/\/+$/, "");
      if (base.endsWith("/api/sync")) {
        base = base.slice(0, -"/api/sync".length);
      }
      const url = `${base}/api/collections?projectUrl=${encodeURIComponent(
        projectUrl || "",
      )}`;
      // add caching to avoid duplicate network requests during sync
      const response = await context.fetcher.fetch({ method: "GET", url, cacheTtlSecs: 300 });
      if (!response.ok) {
        throw new Error(`Failed to fetch collections: ${response.status} ${response.statusText}`);
      }
      const body = await response.json();
      const cols = Array.isArray(body.collections) ? body.collections : [];
      // map to table rows, dropping any entry missing a usable id
      const rows = cols
        .map((c) => ({
          id: String(c?.id || "").trim(),
          name: String(c?.name || ""),
          slug: String(c?.slug || ""),
          readonly: Boolean(c?.readonly),
          managedBy: String(c?.managedBy || ""),
          createdAt: String(c?.createdAt || ""),
          updatedAt: String(c?.updatedAt || ""),
          fields: Array.isArray(c?.fields) ? c.fields : [],
          raw: c,
        }))
        .filter((r) => r.id);
      // explicit continuation field (none)
      return { result: rows, continuation: undefined };
    },
  },
});

// --- Top-level function, not inside formula ---
async function runSyncAsync(
  workerUrl: string,
  syncPayload: Record<string, unknown>,
  context: coda.ExecutionContext,
): Promise<string> {
  const syncResult = await runSyncRequest(workerUrl, syncPayload, context);
  // Return only the jobId for easier log matching
  return syncResult.jobId || '';
}

pack.addFormula({
  name: "SyncTableToFramer",
  description: "Sync a Coda table to a Framer collection and return status message",
  isAction: true,
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "workerUrl",
      description:
        "Sync endpoint URL (e.g., https://coda-to-framer-node.vercel.app/api/sync)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "framerProjectUrl",
      description: "Framer project URL (e.g., https://framer.com/projects/abc123)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "tableIdOrName",
      description:
        "Coda table ID or name (e.g., grid-abc123 or table name in quotes)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "collectionName",
      description: "Name for the Framer collection (will be created if it doesn't exist)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "slugFieldId",
      description: "Column name or ID to use as the slug field (e.g., Short Name or c-abc123)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.Number,
      name: "rowLimit",
      description: "Maximum number of rows to sync (default: 100, max: 500)",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.Boolean,
      name: "publish",
      description: "Publish and deploy the Framer project after successful sync",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.Boolean,
      name: "deleteMissing",
      description:
        "When true, remove Framer collection items not present in the current Coda table snapshot",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.Number,
      name: "initialDelayMs",
      description: "Delay before backend extract to allow Coda UI edits to become API-visible",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "responseColumn",
      description: "Column reference where the sync response will be written (e.g., thisRow.Response)",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "logTableIdOrName",
      description: "Optional Coda log table ID/name for backend callback writes",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "logRowId",
      description: "Optional row ID or selector value in the callback table",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "statusColumnId",
      description: "Optional status column name or ID used by backend callback",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "messageColumnId",
      description: "Optional detailed message column ID for backend callback",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "sourceStatusColumnId",
      description: "Optional source-row status column ID to mirror job state",
      optional: true,
    }),
  ],
  resultType: coda.ValueType.String,
  execute: async (
    [
      workerUrl,
      framerProjectUrl,
      tableIdOrName,
      collectionName,
      slugFieldId,
      rowLimit,
      publish,
      deleteMissing,
      initialDelayMs,
      responseColumn,
      logTableIdOrName,
      logRowId,
      statusColumnId,
      messageColumnId,
      sourceStatusColumnId,
    ],
    context,
  ) => {
    const docId = context.invocationLocation?.docId;
    const invocationRowId = (context.invocationLocation as unknown as { rowId?: string } | undefined)?.rowId || "";

    if (!docId) {
      throw new coda.UserVisibleError("Could not determine document ID");
    }

    const hasExplicitCallbackTable = Boolean(logTableIdOrName);
    const callbackTableInput = hasExplicitCallbackTable
      ? String(logTableIdOrName || "").trim()
      : "";
    const callbackTableName = hasExplicitCallbackTable
      ? normalizeCallbackTableNameOrId(logTableIdOrName, "")
      : normalizeCallbackTableNameOrId(tableIdOrName, String(tableIdOrName));
    const callbackRowSelector = normalizeCallbackRowSelector(logRowId || invocationRowId);
    const defaultStatusColumn = logTableIdOrName ? "Status" : "Response";
    const requestedStatusColumn = normalizeCallbackColumnNameOrId(statusColumnId);
    // Only use `responseColumn` as the status column when no explicit log table
    // is provided (i.e. the caller expects the response to be written into the
    // source row). When a log table is specified, use the explicit
    // `statusColumnId` or fall back to the log table default "Status".
    const fallbackStatusColumn = logTableIdOrName
      ? defaultStatusColumn
      : normalizeCallbackColumnNameOrId(responseColumn || defaultStatusColumn, defaultStatusColumn);
    const resolvedStatusColumn = requestedStatusColumn || fallbackStatusColumn || defaultStatusColumn;
    const normalizedStatusRow = callbackRowSelector;
    const hasCallbackIntent = Boolean(
      logTableIdOrName
      || logRowId
      || statusColumnId
      || responseColumn
      || messageColumnId
      || sourceStatusColumnId,
    );
    const callbackPayload = hasCallbackIntent
      ? {
        statusDocId: docId,
        statusTableIdOrName: callbackTableName || (hasExplicitCallbackTable ? "" : tableIdOrName),
        statusTableInput: callbackTableInput,
        statusRow: normalizedStatusRow,
        statusRowSelector: normalizedStatusRow,
        statusColumn: resolvedStatusColumn,
        statusColumnNameOrId: resolvedStatusColumn,
        statusSlugField: slugFieldId,
        messageColumnId: normalizeCallbackColumnNameOrId(messageColumnId),
        sourceStatusColumnId: normalizeCallbackColumnNameOrId(sourceStatusColumnId),
        statusSlugFieldId: slugFieldId,
      }
      : undefined;

    const requestId = createRequestId();
    const payload = {
      requestId,
      idempotencyKey: makeIdempotencyKey(requestId),
      docId,
      tableIdOrName,
      framerProjectUrl,
      collectionName,
      slugFieldId,
      rowLimit: rowLimit || 100,
      publish: Boolean(publish),
      deleteMissing: Boolean(deleteMissing),
      initialDelayMs: typeof initialDelayMs === "number" ? initialDelayMs : undefined,
      action: "sync",
      ...(callbackPayload ? { callback: callbackPayload } : {}),
    };

    return runSyncAsync(workerUrl, payload, context);
  },
});

pack.addFormula({
  name: "SyncRowToFramer",
  description: "Sync one Coda row to a Framer collection and return status message",
  isAction: true,
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "workerUrl",
      description:
        "Sync endpoint URL (e.g., https://coda-to-framer-node.vercel.app/api/sync)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "framerProjectUrl",
      description: "Framer project URL (e.g., https://framer.com/projects/abc123)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "tableIdOrName",
      description:
        "Coda table ID or name (e.g., grid-abc123 or table name in quotes)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "collectionName",
      description: "Name for the Framer collection (will be created if it doesn't exist)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "slugFieldId",
      description: "Column name or ID to use as the slug field (e.g., Short Name or c-abc123)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "rowId",
      description:
        "Row selector to sync: API row ID (i-abc123) or unique slug value from the slug field",
    }),
    coda.makeParameter({
      type: coda.ParameterType.Boolean,
      name: "publish",
      description: "Publish and deploy the Framer project after successful sync",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.Number,
      name: "initialDelayMs",
      description: "Delay before backend extract to allow Coda UI edits to become API-visible",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "logTableIdOrName",
      description: "Optional Coda log table ID/name for backend callback writes",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "logRowId",
      description: "Optional row ID or selector value in the callback table",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "statusColumnId",
      description: "Optional status column name or ID used by backend callback",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "messageColumnId",
      description: "Optional detailed message column ID for backend callback",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "sourceStatusColumnId",
      description: "Optional source-row status column ID to mirror job state",
      optional: true,
    }),
  ],
  resultType: coda.ValueType.String,
  execute: async (
    [
      workerUrl,
      framerProjectUrl,
      tableIdOrName,
      collectionName,
      slugFieldId,
      rowId,
      publish,
      initialDelayMs,
      logTableIdOrName,
      logRowId,
      statusColumnId,
      messageColumnId,
      sourceStatusColumnId,
    ],
    context,
  ) => {
    const docId = context.invocationLocation?.docId;
    const invocationRowId = (context.invocationLocation as unknown as { rowId?: string } | undefined)?.rowId || "";

    if (!docId) {
      throw new coda.UserVisibleError("Could not determine document ID");
    }

    const hasExplicitCallbackTable = Boolean(logTableIdOrName);
    const callbackTableInput = hasExplicitCallbackTable
      ? String(logTableIdOrName || "").trim()
      : "";
    const callbackTableName = hasExplicitCallbackTable
      ? normalizeCallbackTableNameOrId(logTableIdOrName, "")
      : normalizeCallbackTableNameOrId(tableIdOrName, String(tableIdOrName));
    const callbackRowSelector = normalizeCallbackRowSelector(logRowId || invocationRowId || rowId);
    const defaultStatusColumn = logTableIdOrName ? "Status" : "Response";
    const requestedStatusColumn = normalizeCallbackColumnNameOrId(statusColumnId);
    const resolvedStatusColumn = requestedStatusColumn || defaultStatusColumn;
    const resolvedStatusRow = callbackRowSelector;
    const hasCallbackIntent = Boolean(
      logTableIdOrName
      || logRowId
      || statusColumnId
      || messageColumnId
      || sourceStatusColumnId,
    );
    const callbackPayload = hasCallbackIntent
      ? {
        statusDocId: docId,
        statusTableIdOrName: callbackTableName || (hasExplicitCallbackTable ? "" : tableIdOrName),
        statusTableInput: callbackTableInput,
        statusRow: resolvedStatusRow,
        statusRowSelector: resolvedStatusRow,
        statusColumn: resolvedStatusColumn,
        statusColumnNameOrId: resolvedStatusColumn,
        statusSlugField: slugFieldId,
        messageColumnId: normalizeCallbackColumnNameOrId(messageColumnId),
        sourceStatusColumnId: normalizeCallbackColumnNameOrId(sourceStatusColumnId),
        statusSlugFieldId: slugFieldId,
      }
      : undefined;

    const requestId = createRequestId();
    const payload = {
      requestId,
      idempotencyKey: makeIdempotencyKey(requestId),
      docId,
      tableIdOrName,
      framerProjectUrl,
      collectionName,
      slugFieldId,
      rowId,
      publish: Boolean(publish),
      initialDelayMs: typeof initialDelayMs === "number" ? initialDelayMs : undefined,
      action: "rowSync",
      ...(callbackPayload ? { callback: callbackPayload } : {}),
    };

    return runSyncAsync(workerUrl, payload, context);
  },
});

pack.addFormula({
  name: "GetSyncStatus",
  description: "Get current status text for a previously submitted async sync job",
  isAction: true,
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "workerUrl",
      description:
        "Sync endpoint URL (e.g., https://coda-to-framer-node.vercel.app/api/sync)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "jobId",
      description: "Job ID returned by SyncTableToFramer or SyncRowToFramer",
    }),
  ],
  resultType: coda.ValueType.String,
  execute: async ([workerUrl, jobId], context) => {
    return getSyncStatus(workerUrl, jobId, context);
  },
});

pack.addFormula({
  name: "ExtractSyncJobId",
  description: "Extract the async sync job ID from the action return text",
  isAction: false,
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "syncResponse",
      description: "Response text returned by SyncTableToFramer or SyncRowToFramer",
    }),
  ],
  resultType: coda.ValueType.String,
  execute: async ([syncResponse]) => {
    return extractJobId(syncResponse);
  },
});

pack.addFormula({
  name: "IsSyncTerminalStatus",
  description: "Return true when a sync status text indicates completion or failure",
  isAction: false,
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "statusText",
      description: "Status text from GetSyncStatus or sync callback columns",
    }),
  ],
  resultType: coda.ValueType.Boolean,
  execute: async ([statusText]) => {
    return isSyncTerminalStatus(statusText);
  },
});

pack.addFormula({
  name: "NormalizeSyncStatus",
  description: "Normalize sync status text to one of: pending, running, succeeded, failed, unknown",
  isAction: false,
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "statusText",
      description: "Status text from GetSyncStatus or your status column",
    }),
  ],
  resultType: coda.ValueType.String,
  execute: async ([statusText]) => {
    return normalizeSyncStatus(statusText);
  },
});
