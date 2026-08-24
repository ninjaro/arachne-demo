import { createDbWorker } from "sql.js-httpvfs";
import sqlWorkerUrl from "sql.js-httpvfs/dist/sqlite.worker.js?url";
import sqlWasmUrl from "sql.js-httpvfs/dist/sql-wasm.wasm?url";
import type { WorkerHttpvfs } from "sql.js-httpvfs";
import type {
  ActiveDataManifest,
  ProductRowSource,
  RawRow,
  ShardChunk,
  ShardManifest,
} from "./contracts";
import { resolveDataAsset } from "./manifest";

type Fetch = typeof fetch;

function sqlIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function requireTable(manifest: ShardManifest, table: string) {
  const value = manifest.tables[table];
  if (!value) throw new Error(`table ${table} is outside the demo data contract`);
  return value;
}

async function responseBytes(response: Response, description: string): Promise<ArrayBuffer> {
  if (!response.ok) throw new Error(`${description} failed (${response.status})`);
  return response.arrayBuffer();
}

async function sha256(value: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", value));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class StaticShardSource implements ProductRowSource {
  readonly kind = "static-shards" as const;
  readonly #root: URL;
  readonly #manifest: ShardManifest;
  readonly #fetch: Fetch;
  readonly #cache = new Map<string, Promise<RawRow[]>>();

  constructor(root: URL, manifest: ShardManifest, fetcher: Fetch = fetch) {
    this.#root = root;
    this.#manifest = manifest;
    this.#fetch = fetcher;
  }

  async #chunk(chunk: ShardChunk): Promise<RawRow[]> {
    const cached = this.#cache.get(chunk.file);
    if (cached) return cached;
    const loading = (async () => {
      const response = await this.#fetch(resolveDataAsset(this.#root, chunk.file), {
        cache: "force-cache",
      });
      const bytes = await responseBytes(response, `fallback shard ${chunk.file}`);
      if (await sha256(bytes) !== chunk.sha256) {
        throw new Error(`fallback shard ${chunk.file} failed its content hash`);
      }
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!Array.isArray(value) || value.length !== chunk.rows) {
        throw new Error(`fallback shard ${chunk.file} has an invalid row count`);
      }
      return value as RawRow[];
    })();
    this.#cache.set(chunk.file, loading);
    return loading;
  }

  async all(table: string): Promise<RawRow[]> {
    const contract = requireTable(this.#manifest, table);
    return (await Promise.all(contract.chunks.map((chunk) => this.#chunk(chunk)))).flat();
  }

  async byKey(table: string, value: string): Promise<RawRow[]> {
    const contract = requireTable(this.#manifest, table);
    const chunks = contract.chunks.filter(
      (chunk) => chunk.firstKey <= value && value <= chunk.lastKey,
    );
    const rows = (await Promise.all(chunks.map((chunk) => this.#chunk(chunk)))).flat();
    return rows.filter((row) => row[contract.key] === value);
  }

  async matching(table: string, column: string, value: string): Promise<RawRow[]> {
    const contract = requireTable(this.#manifest, table);
    if (!contract.columns.includes(column)) {
      throw new Error(`column ${table}.${column} is outside the demo data contract`);
    }
    if (column === contract.key) return this.byKey(table, value);
    return (await this.all(table)).filter((row) => row[column] === value);
  }

  async searchNames(query: string, limit: number): Promise<RawRow[]> {
    const normalized = query.toLocaleLowerCase();
    return (await this.all("names"))
      .filter((row) =>
        (typeof row.entity_id === "string" && row.entity_id.toLocaleLowerCase().includes(normalized)) ||
        (typeof row.value === "string" && row.value.toLocaleLowerCase().includes(normalized)),
      )
      .slice(0, limit);
  }

  close() {
    this.#cache.clear();
  }
}

export class SqliteHttpSource implements ProductRowSource {
  readonly kind = "sqlite-httpvfs" as const;
  readonly #worker: WorkerHttpvfs;
  readonly #manifest: ShardManifest;

  constructor(worker: WorkerHttpvfs, manifest: ShardManifest) {
    this.#worker = worker;
    this.#manifest = manifest;
  }

  static async open(
    root: URL,
    active: ActiveDataManifest,
    manifest: ShardManifest,
  ): Promise<SqliteHttpSource> {
    const database = resolveDataAsset(root, active.database.file).href;
    const worker = await createDbWorker(
      [
        {
          from: "inline",
          virtualFilename: "product.sqlite",
          config: {
            serverMode: "full",
            requestChunkSize: active.database.pageSize,
            url: database,
          },
        },
      ],
      sqlWorkerUrl,
      sqlWasmUrl,
    );
    await worker.db.query("PRAGMA query_only = ON");
    for (const [table, contract] of Object.entries(manifest.tables)) {
      const rows = await worker.db.query(
        `PRAGMA table_info(${sqlIdentifier(table)})`,
      ) as unknown as Array<{ name: string }>;
      const columns = rows.map((row) => row.name);
      if (
        columns.length !== contract.columns.length ||
        columns.some((column, index) => column !== contract.columns[index])
      ) {
        throw new Error(`SQLite table ${table} does not match the pinned adapter contract`);
      }
    }
    return new SqliteHttpSource(worker, manifest);
  }

  async all(table: string): Promise<RawRow[]> {
    const contract = requireTable(this.#manifest, table);
    return this.#worker.db.query(
      `SELECT * FROM ${sqlIdentifier(table)} ORDER BY ${sqlIdentifier(contract.key)}`,
    ) as unknown as Promise<RawRow[]>;
  }

  async byKey(table: string, value: string): Promise<RawRow[]> {
    const contract = requireTable(this.#manifest, table);
    return this.#worker.db.query(
      `SELECT * FROM ${sqlIdentifier(table)} WHERE ${sqlIdentifier(contract.key)} = ? ORDER BY rowid`,
      value,
    ) as unknown as Promise<RawRow[]>;
  }

  async matching(table: string, column: string, value: string): Promise<RawRow[]> {
    const contract = requireTable(this.#manifest, table);
    if (!contract.columns.includes(column)) {
      throw new Error(`column ${table}.${column} is outside the demo data contract`);
    }
    return this.#worker.db.query(
      `SELECT * FROM ${sqlIdentifier(table)} WHERE ${sqlIdentifier(column)} = ? ORDER BY rowid`,
      value,
    ) as unknown as Promise<RawRow[]>;
  }

  async searchNames(query: string, limit: number): Promise<RawRow[]> {
    requireTable(this.#manifest, "names");
    const escaped = query.toLocaleLowerCase().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const pattern = `%${escaped}%`;
    return this.#worker.db.query(
      "SELECT * FROM names " +
      "WHERE (entity_id LIKE ? ESCAPE '\\' OR lower(value) LIKE ? ESCAPE '\\') " +
      "AND (entity_id LIKE 'work-%' OR entity_id LIKE 'agent-%') " +
      "ORDER BY is_preferred DESC, value, entity_id, id LIMIT ?",
      pattern,
      pattern,
      Math.max(1, Math.min(10_000, limit)),
    ) as unknown as Promise<RawRow[]>;
  }

  close() {
    // Comlink exposes releaseProxy on a symbol, but worker termination differs
    // between versions. The browser owns this worker for the application life.
  }
}

export async function reliableRangeSupport(
  url: URL,
  expectedBytes: number,
  fetcher: Fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher(url, {
      headers: { Range: "bytes=0-0" },
      cache: "force-cache",
    });
    const contentRange = response.headers.get("Content-Range");
    return (
      response.status === 206 &&
      contentRange === `bytes 0-0/${expectedBytes}` &&
      (await response.arrayBuffer()).byteLength === 1
    );
  } catch {
    return false;
  }
}
