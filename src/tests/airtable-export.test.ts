import { describe, it, expect } from "vitest";
import { AirtableMockClient, AirtableError } from "@/lib/airtable-mock";
import {
  exportRecords,
  isTransient,
  type AirtablePort,
  type ExportRecord,
} from "@/lib/airtable-export";

const noSleep = async () => {};

function makeRecords(n: number): ExportRecord[] {
  return Array.from({ length: n }, (_, i) => ({
    externalId: `task_${i}`,
    fields: { Title: `Task ${i}`, Status: "To do" },
  }));
}

// Fast options for tests: no throttling, no real delays.
const fastOpts = { throttleMs: 0, sleep: noSleep, baseDelayMs: 1, rateLimitDelayMs: 1 };

describe("isTransient", () => {
  it("retries 429, 5xx, and network/unknown errors", () => {
    expect(isTransient(new AirtableError("rate", "rate-limit", 429))).toBe(true);
    expect(isTransient(new AirtableError("server", "server-error", 500))).toBe(true);
    expect(isTransient(new AirtableError("network", "network", 0))).toBe(true);
    expect(isTransient(new Error("no status code"))).toBe(true);
  });

  it("does NOT retry permanent 4xx errors", () => {
    expect(isTransient(new AirtableError("unprocessable", "server-error", 422))).toBe(false);
    expect(isTransient(new AirtableError("forbidden", "server-error", 403))).toBe(false);
  });
});

describe("exportRecords — idempotency (using the provided mock)", () => {
  it("creates on first run and updates (no duplicates) on the second", async () => {
    const client = new AirtableMockClient();
    const records = makeRecords(5);

    const first = await exportRecords(client, records, fastOpts);
    expect(first).toMatchObject({ total: 5, created: 5, updated: 0 });
    expect(first.failures).toHaveLength(0);
    expect(client.__getRecordCount()).toBe(5);

    const second = await exportRecords(client, records, fastOpts);
    expect(second).toMatchObject({ total: 5, created: 0, updated: 5 });
    expect(client.__getRecordCount()).toBe(5); // still 5 — no duplicates
  });

  it("stamps each record with the Task ID key field", async () => {
    const client = new AirtableMockClient();
    await exportRecords(client, makeRecords(2), fastOpts);
    const ids = client.__getRecords().map((r) => r.fields["Task ID"]).sort();
    expect(ids).toEqual(["task_0", "task_1"]);
  });
});

describe("exportRecords — retry behaviour", () => {
  it("retries a transient failure and ultimately succeeds", async () => {
    let createAttempts = 0;
    const client: AirtablePort = {
      list: async () => [],
      create: async ({ fields }) => {
        createAttempts += 1;
        if (createAttempts < 3) throw new AirtableError("temporary", "server-error", 503);
        return { id: `rec_${fields["Task ID"]}` };
      },
      update: async (id) => ({ id }),
    };

    const summary = await exportRecords(client, makeRecords(1), fastOpts);
    expect(createAttempts).toBe(3); // failed twice, succeeded on the third
    expect(summary).toMatchObject({ total: 1, created: 1, updated: 0 });
    expect(summary.failures).toHaveLength(0);
  });

  it("does not retry a permanent failure — records it once and moves on", async () => {
    let createAttempts = 0;
    const client: AirtablePort = {
      list: async () => [],
      create: async () => {
        createAttempts += 1;
        throw new AirtableError("invalid field", "server-error", 422);
      },
      update: async (id) => ({ id }),
    };

    const summary = await exportRecords(client, makeRecords(1), fastOpts);
    expect(createAttempts).toBe(1); // permanent → no retry
    expect(summary.created).toBe(0);
    expect(summary.failures).toEqual([
      { externalId: "task_0", error: "invalid field" },
    ]);
  });
});

describe("exportRecords — partial failure isolation", () => {
  it("keeps exporting the rest when a single record fails", async () => {
    const client: AirtablePort = {
      list: async () => [],
      create: async ({ fields }) => {
        if (fields["Task ID"] === "task_2") {
          throw new AirtableError("bad record", "server-error", 422);
        }
        return { id: `rec_${fields["Task ID"]}` };
      },
      update: async (id) => ({ id }),
    };

    const summary = await exportRecords(client, makeRecords(5), fastOpts);
    expect(summary.total).toBe(5);
    expect(summary.created).toBe(4);
    expect(summary.failures).toEqual([{ externalId: "task_2", error: "bad record" }]);
  });
});
