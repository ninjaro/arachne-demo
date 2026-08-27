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

const shardsWithRemoteAssets: ShardManifest = {
  ...shards,
  tables: {
    remote_assets: {
      key: "entity_id",
      columns: [
        "id",
        "entity_id",
        "provider",
        "remote_key",
        "media_kind",
        "direct_url",
        "source_page_url",
        "origin_provider",
        "origin_entity_id",
        "origin_property",
        "mime_type",
        "width_pixels",
        "height_pixels",
        "license_id",
        "license_name",
        "license_url",
        "attribution_text",
        "author_text",
        "credit_text",
        "rights_status",
        "display_allowed",
        "rights_note",
      ],
      rows: 2,
      chunks: [],
    },
  },
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

  it("projects canonical remote asset links and rights without conflating their URLs", async () => {
    const source = new RecordingSource();
    source.rows.set("remote_assets", [
      {
        id: 2,
        entity_id: "work-000001",
        provider: "wikimedia_commons",
        remote_key: "File:Restricted.jpg",
        media_kind: "image",
        direct_url: "https://upload.wikimedia.org/restricted.jpg",
        source_page_url: "https://commons.wikimedia.org/wiki/File:Restricted.jpg",
        origin_provider: "wikidata",
        origin_entity_id: "Q1",
        origin_property: "P18",
        mime_type: "image/jpeg",
        width_pixels: 640,
        height_pixels: 480,
        license_id: null,
        license_name: null,
        license_url: null,
        attribution_text: null,
        author_text: null,
        credit_text: null,
        rights_status: "restricted",
        display_allowed: 0,
        rights_note: "Link only",
      },
      {
        id: 1,
        entity_id: "work-000001",
        provider: "wikimedia_commons",
        remote_key: "File:Allowed.jpg",
        media_kind: "poster",
        direct_url: "https://upload.wikimedia.org/allowed.jpg",
        source_page_url: "https://commons.wikimedia.org/wiki/File:Allowed.jpg",
        origin_provider: "wikidata",
        origin_entity_id: "Q1",
        origin_property: "P3383",
        mime_type: "image/jpeg",
        width_pixels: 800,
        height_pixels: 1200,
        license_id: "CC-BY-4.0",
        license_name: "CC BY 4.0",
        license_url: "https://creativecommons.org/licenses/by/4.0/",
        attribution_text: "Example creator / CC BY 4.0",
        author_text: "Example creator",
        credit_text: "Example collection",
        rights_status: "licensed",
        display_allowed: 1,
        rights_note: null,
      },
    ]);
    const adapter = new DemoDataAdapter(
      new URL("https://example.test/data/"),
      active,
      shardsWithRemoteAssets,
      source,
      fetch,
    );

    const result = await adapter.work("work-000001");

    expect(result?.remoteAssets).toEqual([
      expect.objectContaining({
        id: "remote-asset:1",
        directUrl: "https://upload.wikimedia.org/allowed.jpg",
        sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Allowed.jpg",
        rightsStatus: "licensed",
        displayAllowed: true,
      }),
      expect.objectContaining({
        id: "remote-asset:2",
        directUrl: "https://upload.wikimedia.org/restricted.jpg",
        sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Restricted.jpg",
        rightsStatus: "restricted",
        displayAllowed: false,
        rightsNote: "Link only",
      }),
    ]);
    expect(source.lookups).toContain("remote_assets.entity_id:work-000001");
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
