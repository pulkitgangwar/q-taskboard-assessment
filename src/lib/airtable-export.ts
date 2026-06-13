/**
 * Airtable export orchestration — client-agnostic and unit-testable.
 *
 * The concrete Airtable client (the real one in `airtable.ts`, or the test
 * double in `airtable-mock.ts`) is injected via the `AirtablePort` interface,
 * so all of the tricky behaviour — idempotency, retry/back-off classification,
 * rate-limit pacing, and per-record failure isolation — is tested without any
 * network access or credentials.
 */

export type AirtableFields = Record<string, unknown>;

export interface AirtablePort {
  /** List every record in the table (the real client paginates internally). */
  list(): Promise<{ id: string; fields: AirtableFields }[]>;
  create(input: { fields: AirtableFields }): Promise<{ id: string }>;
  update(id: string, fields: AirtableFields): Promise<{ id: string }>;
}

/** One TaskBoard task ready to be pushed, keyed by a stable external id. */
export interface ExportRecord {
  externalId: string;
  fields: AirtableFields;
}

export interface ExportOptions {
  /** Field in Airtable that stores the TaskBoard id; used to de-duplicate. */
  keyField?: string;
  /** Max retry attempts for a single transient failure. */
  maxRetries?: number;
  /** Base delay for exponential back-off (ms). */
  baseDelayMs?: number;
  /** Wait applied specifically after a 429 rate-limit response (ms). */
  rateLimitDelayMs?: number;
  /** Minimum gap between write requests to stay under ~5 req/s per base (ms). */
  throttleMs?: number;
  /** Injectable sleep so tests run instantly. */
  sleep?: (ms: number) => Promise<void>;
}

export interface ExportFailure {
  externalId: string;
  error: string;
}

export interface ExportSummary {
  total: number;
  created: number;
  updated: number;
  failures: ExportFailure[];
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function statusCodeOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "statusCode" in err) {
    const code = (err as { statusCode?: unknown }).statusCode;
    if (typeof code === "number") return code;
  }
  return undefined;
}

/**
 * Transient = worth retrying: 429 (rate limit), any 5xx (server error), and
 * unknown/network failures (no status code). Permanent = a definitive 4xx such
 * as 422 (invalid field) or 403 (forbidden) — retrying those just wastes calls.
 */
export function isTransient(err: unknown): boolean {
  const code = statusCodeOf(err);
  if (code === undefined || code === 0) return true; // network / unknown
  if (code === 429) return true;
  if (code >= 500) return true;
  return false;
}

/**
 * Extract a readable message from a failure. The `airtable` SDK rejects with
 * plain objects ({ error, message, statusCode }) that are NOT Error instances,
 * so we handle that shape explicitly instead of stringifying to "[object Object]".
 */
export function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const o = err as { error?: unknown; message?: unknown };
    const parts: string[] = [];
    if (typeof o.error === "string") parts.push(o.error);
    if (typeof o.message === "string" && o.message !== o.error) parts.push(o.message);
    if (parts.length) return parts.join(": ");
  }
  return String(err);
}

/** Run `fn`, retrying transient failures with exponential back-off. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: Required<Pick<ExportOptions, "maxRetries" | "baseDelayMs" | "rateLimitDelayMs" | "sleep">>,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransient(err) || attempt >= opts.maxRetries) throw err;
      const isRateLimit = statusCodeOf(err) === 429;
      const delay = isRateLimit
        ? opts.rateLimitDelayMs
        : opts.baseDelayMs * 2 ** attempt;
      attempt += 1;
      await opts.sleep(delay);
    }
  }
}

/**
 * Push records to Airtable idempotently.
 *
 * - Existing records (matched on `keyField`) are updated; new ones are created,
 *   so running the export repeatedly never creates duplicates.
 * - Each record is retried independently; a permanent failure on one record is
 *   captured in `failures` and does not abort the rest of the export.
 */
export async function exportRecords(
  client: AirtablePort,
  records: ExportRecord[],
  options: ExportOptions = {},
): Promise<ExportSummary> {
  const keyField = options.keyField ?? "Task ID";
  const retry = {
    maxRetries: options.maxRetries ?? 4,
    baseDelayMs: options.baseDelayMs ?? 500,
    rateLimitDelayMs: options.rateLimitDelayMs ?? 30_000,
    sleep: options.sleep ?? defaultSleep,
  };
  const throttleMs = options.throttleMs ?? 210;

  // One list call (retried) to learn what already exists. A failure here is
  // fatal: without it we can't guarantee idempotency, so we surface it.
  const existing = await withRetry(() => client.list(), retry);
  const byKey = new Map<string, string>();
  for (const rec of existing) {
    const key = rec.fields[keyField];
    if (typeof key === "string") byKey.set(key, rec.id);
  }

  const summary: ExportSummary = {
    total: records.length,
    created: 0,
    updated: 0,
    failures: [],
  };

  let first = true;
  for (const record of records) {
    if (!first && throttleMs > 0) await retry.sleep(throttleMs);
    first = false;

    const fields = { ...record.fields, [keyField]: record.externalId };
    const existingId = byKey.get(record.externalId);

    try {
      if (existingId) {
        await withRetry(() => client.update(existingId, fields), retry);
        summary.updated += 1;
      } else {
        const created = await withRetry(() => client.create({ fields }), retry);
        byKey.set(record.externalId, created.id); // guard against dupes within this run
        summary.created += 1;
      }
    } catch (err) {
      summary.failures.push({ externalId: record.externalId, error: messageOf(err) });
    }
  }

  return summary;
}
