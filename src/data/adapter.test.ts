import { describe, expect, it } from "vitest";
import type {
  ActiveDataManifest,
  ProductRowSource,
  RawRow,
  ShardManifest,
} from "./contracts";
import { DemoDataAdapter } from "./index";

const product = "a".repeat(64);
const fallback = "c".repeat(64);
const active: ActiveDataManifest = {
  format: "arachne_demo_active_v1",
  formatVersion: 1,
  adapterContract: "arachne_product_sqlite_v1",
  productSnapshotId: `local-${product.slice(0, 16)}`,
  productSha256: product,
  schemaIdentity: "fae7c3899a19a645cfcc85bef764fafa758f37a5d014108d62025e2d3e3d6ecc",
  sourceDataCommit: "b".repeat(40),
  producer: { repository: "ninjaro/arachne", commit: "d".repeat(40) },
  database: { file: `product-${product}.sqlite`, bytes: 8192, pageSize: 4096 },
  fallback: {
    file: `fallback/product-${product}/manifest-${fallback}.json`,
    sha256: fallback,
  },
  derived: {},
};
const shards: ShardManifest = {
  format: "arachne_demo_shards_v1",
  formatVersion: 1,
  productSha256: product,
  schemaIdentity: active.schemaIdentity,
  tables: {},
};

class RecordingSource implements ProductRowSource {
  readonly kind = "static-shards" as const;
  allCalls = 0;
  allTables: string[] = [];
  lookups: string[] = [];
  searchCalls: Array<{ query: string; limit: number }> = [];
  readonly rows = new Map<string, RawRow[]>([
    ["works", [{
      entity_id: "work-000001",
      medium: "film",
      year_start: 2001,
      year_end: null,
      date_precision: "year",
      date_start_text: null,
      date_end_text: null,
      date_qualifier: null,
      language_code: null,
      country_code: null,
      production_info_json: null,
    }]],
    ["names", [{ id: 1, entity_id: "work-000001", name_type: "original", language_code: null, script_code: null, value: "Target Work", is_preferred: 1 }]],
  ]);

  async all(table: string) {
    this.allCalls += 1;
    this.allTables.push(table);
    return this.rows.get(table) ?? [];
  }
  async byKey(table: string, value: string) {
    this.lookups.push(`${table}:${value}`);
    const key = table === "works" ? "entity_id" : table === "names" ? "entity_id" : table === "manifestations" || table === "financial_facts" || table === "work_concepts" || table === "parent_guide_assertions" ? "work_id" : "entity_id";
    return (this.rows.get(table) ?? []).filter((row) => row[key] === value);
  }
  async matching(table: string, column: string, value: string) {
    this.lookups.push(`${table}.${column}:${value}`);
    return (this.rows.get(table) ?? []).filter((row) => row[column] === value);
  }
  async searchNames(query: string, limit: number) {
    this.searchCalls.push({ query, limit });
    return (this.rows.get("names") ?? [])
      .filter((row) => String(row.value).toLocaleLowerCase().includes(query))
      .slice(0, limit);
  }
  close() {}
}

describe("DemoDataAdapter targeted reads", () => {
  it("loads one work without hydrating every table or unrelated shard", async () => {
    const source = new RecordingSource();
    const adapter = new DemoDataAdapter(
      new URL("https://example.test/data/"),
      active,
      shards,
      source,
      fetch,
    );
    await expect(adapter.work("work-000001")).resolves.toMatchObject({
      id: "work-000001",
      label: "Target Work",
      medium: "film",
    });
    expect(source.allCalls).toBe(0);
    expect(source.lookups).not.toContain("works:work-999999");
  });

  it("reports absent native projections clearly", async () => {
    const adapter = new DemoDataAdapter(
      new URL("https://example.test/data/"), active, shards, new RecordingSource(), fetch,
    );
    await expect(adapter.research()).rejects.toThrow(/no native research projection/u);
    expect(adapter.asset("taste")).toBeNull();
  });

  it("routes ordinary name search through the bounded source query", async () => {
    const source = new RecordingSource();
    const adapter = new DemoDataAdapter(
      new URL("https://example.test/data/"), active, shards, source, fetch,
    );
    await expect(adapter.search("target", 25)).resolves.toEqual([
      { id: "work-000001", label: "Target Work", family: "work" },
    ]);
    expect(source.searchCalls).toEqual([{ query: "target", limit: 100 }]);
    expect(source.allCalls).toBe(0);
  });

  it("builds ordinary Browse without scanning detail-only tables", async () => {
    const source = new RecordingSource();
    const adapter = new DemoDataAdapter(
      new URL("https://example.test/data/"), active, shards, source, fetch,
    );
    await adapter.browseCatalog();
    expect(source.allTables).toEqual([
      "names",
      "concepts",
      "agents",
      "work_concepts",
      "credits",
      "external_ids",
      "works",
    ]);
    expect(source.allTables).not.toContain("events");
    expect(source.allTables).not.toContain("manifestations");
    expect(source.allTables).not.toContain("parent_guide_assertions");
  });
});
