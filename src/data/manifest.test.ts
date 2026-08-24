import { describe, expect, it } from "vitest";
import { parseActiveManifest, parseShardManifest, resolveDataAsset } from "./manifest";

const product = "a".repeat(64);
const schema = "fae7c3899a19a645cfcc85bef764fafa758f37a5d014108d62025e2d3e3d6ecc";
const fallback = "c".repeat(64);

function active() {
  return {
    format: "arachne_demo_active_v1",
    formatVersion: 1,
    adapterContract: "arachne_product_sqlite_v1",
    productSnapshotId: `local-${product.slice(0, 16)}`,
    productSha256: product,
    schemaIdentity: schema,
    sourceDataCommit: "b".repeat(40),
    producer: { repository: "ninjaro/arachne", commit: "d".repeat(40) },
    database: {
      file: `product-${product}.sqlite`,
      bytes: 8192,
      pageSize: 4096,
    },
    fallback: {
      file: `fallback/product-${product}/manifest-${fallback}.json`,
      sha256: fallback,
    },
    derived: {},
  };
}

describe("data manifests", () => {
  it("accepts a closed immutable product identity", () => {
    expect(parseActiveManifest(active()).productSha256).toBe(product);
  });

  it("rejects mutable database names and unknown schema contracts", () => {
    expect(() => parseActiveManifest({
      ...active(),
      database: { ...active().database, file: "product.sqlite" },
    })).toThrow(/inconsistent/u);
    expect(() => parseActiveManifest({
      ...active(),
      schemaIdentity: "d".repeat(64),
    })).toThrow(/inconsistent/u);
  });

  it("rejects mutable fallback paths and open producer controls", () => {
    expect(() => parseActiveManifest({
      ...active(),
      fallback: { ...active().fallback, file: "fallback/manifest.json" },
    })).toThrow(/inconsistent/u);
    expect(() => parseActiveManifest({
      ...active(),
      producer: { repository: "ninjaro/other", commit: "d".repeat(40) },
    })).toThrow(/inconsistent/u);
    expect(() => parseActiveManifest({
      ...active(),
      derived: { research: "derived/research.json" },
    })).toThrow(/inconsistent/u);
  });

  it("binds fallback shards to the same product and schema", () => {
    const parsed = parseActiveManifest(active());
    expect(() => parseShardManifest({
      format: "arachne_demo_shards_v1",
      formatVersion: 1,
      productSha256: "e".repeat(64),
      schemaIdentity: schema,
      tables: {},
    }, parsed)).toThrow(/mismatched/u);
  });

  it("confines relative assets to the publication root", () => {
    const root = new URL("https://example.test/arachne-demo/data/");
    expect(resolveDataAsset(root, "fallback/manifest.json").href).toBe(
      "https://example.test/arachne-demo/data/fallback/manifest.json",
    );
    expect(() => resolveDataAsset(root, "../private.json")).toThrow(/invalid/u);
  });
});
