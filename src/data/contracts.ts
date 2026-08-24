import adapterContract from "./adapter-contract.json";

export const ACTIVE_FORMAT = "arachne_demo_active_v1";
export const SHARD_FORMAT = "arachne_demo_shards_v1";
export const ADAPTER_CONTRACT = adapterContract.adapterContract as "arachne_product_sqlite_v1";

// The viewer intentionally fails closed when its pinned data submodule moves to
// a product schema that this adapter has not been reviewed against.
export const SUPPORTED_SCHEMA_IDENTITIES = new Set(
  adapterContract.supportedSchemaIdentities,
);

export interface ActiveDataManifest {
  format: typeof ACTIVE_FORMAT;
  formatVersion: 1;
  adapterContract: typeof ADAPTER_CONTRACT;
  productSnapshotId: string;
  productSha256: string;
  schemaIdentity: string;
  sourceDataCommit: string;
  producer: {
    repository: "ninjaro/arachne";
    commit: string;
  };
  database: {
    file: string;
    bytes: number;
    pageSize: number;
  };
  fallback: {
    file: string;
    sha256: string;
  };
  derived: {
    research?: string;
    taste?: string;
    imageHints?: string;
  };
}

export interface ShardChunk {
  file: string;
  firstKey: string;
  lastKey: string;
  rows: number;
  sha256: string;
}

export interface ShardTable {
  key: string;
  columns: string[];
  rows: number;
  chunks: ShardChunk[];
}

export interface ShardManifest {
  format: typeof SHARD_FORMAT;
  formatVersion: 1;
  productSha256: string;
  schemaIdentity: string;
  tables: Record<string, ShardTable>;
}

export type RawValue = string | number | null;
export type RawRow = Record<string, RawValue>;

export interface ProductRowSource {
  readonly kind: "sqlite-httpvfs" | "static-shards";
  all(table: string): Promise<RawRow[]>;
  byKey(table: string, value: string): Promise<RawRow[]>;
  matching(table: string, column: string, value: string): Promise<RawRow[]>;
  searchNames(query: string, limit: number): Promise<RawRow[]>;
  close(): void;
}
