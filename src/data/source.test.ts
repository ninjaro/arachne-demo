import { describe, expect, it, vi } from "vitest";
import type { ShardManifest } from "./contracts";
import { reliableRangeSupport, SqliteHttpSource, StaticShardSource } from "./source";
import type { WorkerHttpvfs } from "sql.js-httpvfs";

async function digest(value: string): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("static shard source", () => {
  it("fetches only the chunk containing a requested key", async () => {
    const first = '[{"entity_id":"work-000001","medium":"film"}]\n';
    const second = '[{"entity_id":"work-002001","medium":"novel"}]\n';
    const manifest: ShardManifest = {
      format: "arachne_demo_shards_v1",
      formatVersion: 1,
      productSha256: "a".repeat(64),
      schemaIdentity: "b".repeat(64),
      tables: {
        works: {
          key: "entity_id",
          columns: ["entity_id", "medium"],
          rows: 2,
          chunks: [
            { file: `fallback/product-${"a".repeat(64)}/tables/works/00000-${await digest(first)}.json`, firstKey: "work-000001", lastKey: "work-001000", rows: 1, sha256: await digest(first) },
            { file: `fallback/product-${"a".repeat(64)}/tables/works/00001-${await digest(second)}.json`, firstKey: "work-001001", lastKey: "work-003000", rows: 1, sha256: await digest(second) },
          ],
        },
      },
    };
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/00001-")) return new Response(second);
      if (url.includes("/00000-")) return new Response(first);
      return new Response(null, { status: 404 });
    });
    const source = new StaticShardSource(
      new URL("https://example.test/data/"),
      manifest,
      fetcher as unknown as typeof fetch,
    );
    await expect(source.byKey("works", "work-002001")).resolves.toEqual([
      { entity_id: "work-002001", medium: "novel" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain("/00001-");
  });
});

describe("HTTP range probe", () => {
  it("requires an exact one-byte 206 response", async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([83]), {
      status: 206,
      headers: { "Content-Range": "bytes 0-0/8192" },
    }));
    await expect(reliableRangeSupport(new URL("https://example.test/product.sqlite"), 8192, fetcher as unknown as typeof fetch)).resolves.toBe(true);
  });

  it("falls back when a static host ignores Range", async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([83]), { status: 200 }));
    await expect(reliableRangeSupport(new URL("https://example.test/product.sqlite"), 8192, fetcher as unknown as typeof fetch)).resolves.toBe(false);
  });
});

describe("SQLite source search", () => {
  it("uses a bounded parameterized query rather than hydrating the names table", async () => {
    const query = vi.fn(async (..._arguments: unknown[]) => []);
    const worker = { db: { query }, worker: {}, configs: [] } as unknown as WorkerHttpvfs;
    const manifest: ShardManifest = {
      format: "arachne_demo_shards_v1",
      formatVersion: 1,
      productSha256: "a".repeat(64),
      schemaIdentity: "b".repeat(64),
      tables: {
        names: {
          key: "entity_id",
          columns: ["id", "entity_id", "value", "is_preferred"],
          rows: 0,
          chunks: [],
        },
      },
    };
    const source = new SqliteHttpSource(worker, manifest);
    await source.searchNames("100% real", 25);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/WHERE.*LIMIT \?/u);
    expect(query.mock.calls[0].slice(1)).toEqual(["%100\\% real%", "%100\\% real%", 25]);
  });
});
