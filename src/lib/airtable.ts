import Airtable, { type FieldSet } from "airtable";
import type { AirtableFields, AirtablePort } from "./airtable-export";

/**
 * Real Airtable client built on the official `airtable` npm package, adapted to
 * the `AirtablePort` interface the exporter expects. Errors thrown by the SDK
 * carry a numeric `statusCode`, which the exporter's retry logic classifies as
 * transient (429/5xx/network) or permanent (other 4xx).
 */
export class AirtableClient implements AirtablePort {
  private table;

  constructor(params: { apiKey: string; baseId: string; tableName: string }) {
    const base = new Airtable({ apiKey: params.apiKey }).base(params.baseId);
    this.table = base(params.tableName);
  }

  async list(): Promise<{ id: string; fields: AirtableFields }[]> {
    // `.all()` follows pagination internally (handles up to ~1,000s of rows).
    const records = await this.table.select().all();
    return records.map((r) => ({ id: r.id, fields: r.fields as AirtableFields }));
  }

  async create(input: { fields: AirtableFields }): Promise<{ id: string }> {
    // typecast lets Airtable coerce strings into select/number/date columns.
    const created = await this.table.create(
      [{ fields: input.fields as Partial<FieldSet> }],
      { typecast: true },
    );
    return { id: created[0].id };
  }

  async update(id: string, fields: AirtableFields): Promise<{ id: string }> {
    const updated = await this.table.update(
      [{ id, fields: fields as Partial<FieldSet> }],
      { typecast: true },
    );
    return { id: updated[0].id };
  }
}

export type AirtableConfig = {
  apiKey: string;
  baseId: string;
  tableName: string;
};

/** Read Airtable credentials from the environment, or return null if unset. */
export function getAirtableConfig(): AirtableConfig | null {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || "Tasks";
  if (!apiKey || !baseId) return null;
  return { apiKey, baseId, tableName };
}

// ---------------------------------------------------------------------------
// Metadata API — create one table per project so tasks from different projects
// never share a table. The `airtable` npm package only covers record CRUD, so
// the schema (table + columns) is managed via the REST metadata API directly.
// Requires PAT scopes `schema.bases:read` and `schema.bases:write`.
// ---------------------------------------------------------------------------

const META_BASE = "https://api.airtable.com/v0/meta/bases";

// The columns every exported task table gets. "Task ID" is the primary field
// and the idempotency key. Text-friendly types keep `typecast` writes simple.
const TASK_TABLE_FIELDS = [
  { name: "Task ID", type: "singleLineText" },
  { name: "Title", type: "singleLineText" },
  { name: "Description", type: "multilineText" },
  { name: "Status", type: "singleLineText" },
  { name: "Assignee", type: "singleLineText" },
  { name: "Position", type: "number", options: { precision: 0 } },
  { name: "Created At", type: "singleLineText" },
] as const;

type AirtableTableMeta = { id: string; name: string };

async function metaFetch(
  config: AirtableConfig,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${META_BASE}/${config.baseId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    // Shape the error like the record SDK's rejections so the exporter's retry
    // classifier (statusCode-based) and message extractor work uniformly.
    const err = body?.error;
    const type = typeof err === "string" ? err : err?.type;
    const message = typeof err === "object" ? err?.message : undefined;
    throw Object.assign(new Error(message || type || `metadata request failed (${res.status})`), {
      statusCode: res.status,
      error: type,
    });
  }
  return body;
}

/**
 * Build a unique, valid Airtable table name for a project. Includes a slice of
 * the project id so two projects with the same name can't collide.
 */
export function projectTableName(projectId: string, projectName: string): string {
  const base = (projectName || "Tasks").trim().slice(0, 38) || "Tasks";
  return `${base} [${projectId.slice(-8)}]`;
}

/**
 * Ensure a dedicated table exists for the project and return its id.
 *
 * Self-healing and idempotent: it reads the base schema first and reuses a table
 * matched by stored id or by name; only when none exists does it create one.
 */
export async function ensureProjectTable(
  config: AirtableConfig,
  project: { id: string; name: string; airtableTableId: string | null },
): Promise<{ tableId: string; created: boolean }> {
  const desiredName = projectTableName(project.id, project.name);

  const schema = (await metaFetch(config, "/tables")) as { tables?: AirtableTableMeta[] };
  const tables = schema.tables ?? [];

  const existing =
    (project.airtableTableId && tables.find((t) => t.id === project.airtableTableId)) ||
    tables.find((t) => t.name === desiredName);
  if (existing) return { tableId: existing.id, created: false };

  const created = (await metaFetch(config, "/tables", {
    method: "POST",
    body: JSON.stringify({ name: desiredName, fields: TASK_TABLE_FIELDS }),
  })) as AirtableTableMeta;

  return { tableId: created.id, created: true };
}
