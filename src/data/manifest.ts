import {
  ACTIVE_FORMAT,
  ADAPTER_CONTRACT,
  SHARD_FORMAT,
  SUPPORTED_SCHEMA_IDENTITIES,
} from "./contracts";
import type {
  ActiveDataManifest,
  ShardChunk,
  ShardManifest,
  ShardTable,
} from "./contracts";

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const SNAPSHOT = /^local-[0-9a-f]{16}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function isRelativeAssetPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/")) {
    return false;
  }
  const segments = value.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

function isDerived(value: unknown): value is ActiveDataManifest["derived"] {
  if (!isRecord(value)) return false;
  const stems: Record<string, string> = {
    research: "research",
    taste: "taste-index",
    imageHints: "wikidata-image-hints",
  };
  return Object.entries(value).every(
    ([key, path]) =>
      typeof stems[key] === "string" &&
      isRelativeAssetPath(path) &&
      path.startsWith(`derived/${stems[key]}-`) &&
      /-[0-9a-f]{64}\.json$/u.test(path),
  );
}

export function parseActiveManifest(value: unknown): ActiveDataManifest {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "format", "formatVersion", "adapterContract", "productSnapshotId",
      "productSha256", "schemaIdentity", "sourceDataCommit", "producer",
      "database", "fallback", "derived",
    ]) ||
    !isRecord(value.database) ||
    !isRecord(value.fallback) ||
    !isRecord(value.producer)
  ) {
    throw new Error("active data manifest must be an object");
  }
  const database = value.database;
  const fallback = value.fallback;
  const producer = value.producer;
  if (
    value.format !== ACTIVE_FORMAT ||
    value.formatVersion !== 1 ||
    value.adapterContract !== ADAPTER_CONTRACT ||
    typeof value.productSha256 !== "string" ||
    !SHA256.test(value.productSha256) ||
    typeof value.schemaIdentity !== "string" ||
    !SHA256.test(value.schemaIdentity) ||
    !SUPPORTED_SCHEMA_IDENTITIES.has(value.schemaIdentity) ||
    typeof value.sourceDataCommit !== "string" ||
    !COMMIT.test(value.sourceDataCommit) ||
    !hasExactKeys(producer, ["repository", "commit"]) ||
    producer.repository !== "ninjaro/arachne" ||
    typeof producer.commit !== "string" ||
    !COMMIT.test(producer.commit) ||
    typeof value.productSnapshotId !== "string" ||
    !SNAPSHOT.test(value.productSnapshotId) ||
    value.productSnapshotId !== `local-${value.productSha256.slice(0, 16)}` ||
    !isRelativeAssetPath(database.file) ||
    database.file !== `product-${value.productSha256}.sqlite` ||
    !hasExactKeys(database, ["file", "bytes", "pageSize"]) ||
    !Number.isSafeInteger(database.bytes) ||
    (database.bytes as number) <= 0 ||
    !Number.isSafeInteger(database.pageSize) ||
    (database.pageSize as number) < 512 ||
    !hasExactKeys(fallback, ["file", "sha256"]) ||
    !isRelativeAssetPath(fallback.file) ||
    typeof fallback.sha256 !== "string" ||
    !SHA256.test(fallback.sha256) ||
    fallback.file !==
      `fallback/product-${value.productSha256}/manifest-${fallback.sha256}.json` ||
    !isDerived(value.derived)
  ) {
    throw new Error("unsupported or inconsistent active data manifest");
  }
  return value as unknown as ActiveDataManifest;
}

function isChunk(value: unknown, active: ActiveDataManifest): value is ShardChunk {
  if (!isRecord(value)) return false;
  return (
    hasExactKeys(value, ["file", "firstKey", "lastKey", "rows", "sha256"]) &&
    isRelativeAssetPath(value.file) &&
    typeof value.firstKey === "string" &&
    typeof value.lastKey === "string" &&
    value.firstKey <= value.lastKey &&
    Number.isSafeInteger(value.rows) &&
    (value.rows as number) > 0 &&
    typeof value.sha256 === "string" &&
    SHA256.test(value.sha256) &&
    value.file.startsWith(`fallback/product-${active.productSha256}/tables/`) &&
    value.file.endsWith(`-${value.sha256}.json`)
  );
}

function isTable(value: unknown, active: ActiveDataManifest): value is ShardTable {
  if (!isRecord(value)) return false;
  return (
    hasExactKeys(value, ["key", "columns", "rows", "chunks"]) &&
    typeof value.key === "string" &&
    value.key.length > 0 &&
    Array.isArray(value.columns) &&
    value.columns.length > 0 &&
    value.columns.every((column) => typeof column === "string" && column.length > 0) &&
    new Set(value.columns).size === value.columns.length &&
    value.columns.includes(value.key) &&
    Number.isSafeInteger(value.rows) &&
    (value.rows as number) >= 0 &&
    Array.isArray(value.chunks) &&
    value.chunks.every((chunk) => isChunk(chunk, active)) &&
    value.chunks.reduce((total, chunk) => total + chunk.rows, 0) === value.rows
  );
}

export function parseShardManifest(
  value: unknown,
  active: ActiveDataManifest,
): ShardManifest {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["format", "formatVersion", "productSha256", "schemaIdentity", "tables"]) ||
    value.format !== SHARD_FORMAT ||
    value.formatVersion !== 1 ||
    value.productSha256 !== active.productSha256 ||
    value.schemaIdentity !== active.schemaIdentity ||
    !isRecord(value.tables) ||
    !Object.values(value.tables).every((table) => isTable(table, active))
  ) {
    throw new Error("unsupported or mismatched fallback manifest");
  }
  return value as unknown as ShardManifest;
}

export function resolveDataAsset(root: URL, relative: string): URL {
  if (!isRelativeAssetPath(relative)) throw new Error("invalid data asset path");
  const resolved = new URL(relative, root);
  if (resolved.origin !== root.origin || !resolved.pathname.startsWith(root.pathname)) {
    throw new Error("data asset path escapes its publication root");
  }
  return resolved;
}
