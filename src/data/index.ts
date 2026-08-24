import { isResearchData } from "../lib/data";
import type {
  Agent,
  AgentRelation,
  Catalog,
  ResearchData,
  Work,
  WorkMembership,
  WorkRelation,
} from "../lib/types";
import {
  projectAgent,
  projectBrowseCatalog,
  projectCatalog,
  projectWork,
} from "./catalog";
import type {
  ActiveDataManifest,
  ProductRowSource,
  ShardManifest,
} from "./contracts";
import {
  parseActiveManifest,
  parseShardManifest,
  resolveDataAsset,
} from "./manifest";
import {
  reliableRangeSupport,
  SqliteHttpSource,
  StaticShardSource,
} from "./source";

type Fetch = typeof fetch;

export class ProjectionUnavailableError extends Error {}

export interface EntitySearchResult {
  id: string;
  label: string;
  family: "work" | "agent";
}

async function fetchJson(url: URL, fetcher: Fetch, cache: RequestCache): Promise<unknown> {
  const response = await fetcher(url, { cache });
  if (!response.ok) throw new Error(`${url.pathname} load failed (${response.status})`);
  return response.json() as Promise<unknown>;
}

async function fetchVerifiedJson(
  url: URL,
  expectedSha256: string,
  fetcher: Fetch,
): Promise<unknown> {
  const response = await fetcher(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`${url.pathname} load failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const actual = [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== expectedSha256) throw new Error("fallback manifest failed its content hash");
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export interface OpenDataOptions {
  fetcher?: Fetch;
  rangeProbe?: typeof reliableRangeSupport;
  sqliteOpen?: (
    root: URL,
    active: ActiveDataManifest,
    manifest: ShardManifest,
  ) => Promise<ProductRowSource>;
}

export class DemoDataAdapter {
  readonly manifest: ActiveDataManifest;
  readonly sourceKind: ProductRowSource["kind"];
  readonly #root: URL;
  readonly #source: ProductRowSource;
  readonly #shards: ShardManifest;
  readonly #fetch: Fetch;
  #catalog?: Promise<Catalog>;
  #browseCatalog?: Promise<Catalog>;

  constructor(
    root: URL,
    manifest: ActiveDataManifest,
    shards: ShardManifest,
    source: ProductRowSource,
    fetcher: Fetch,
  ) {
    this.#root = root;
    this.manifest = manifest;
    this.#shards = shards;
    this.#source = source;
    this.#fetch = fetcher;
    this.sourceKind = source.kind;
  }

  catalog(): Promise<Catalog> {
    this.#catalog ??= projectCatalog(this.#source, this.manifest, this.#shards);
    return this.#catalog;
  }

  browseCatalog(): Promise<Catalog> {
    this.#browseCatalog ??= projectBrowseCatalog(
      this.#source,
      this.manifest,
      this.#shards,
    );
    return this.#browseCatalog;
  }

  async work(id: string): Promise<Work | null> {
    return projectWork(this.#source, this.manifest, this.#shards, id);
  }

  async agent(id: string): Promise<Agent | null> {
    return projectAgent(this.#source, id);
  }

  async search(query: string, limit = 100): Promise<EntitySearchResult[]> {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    const choices = new Map<string, { label: string; preferred: number; id: number }>();
    for (const row of await this.#source.searchNames(normalized, Math.max(1, limit * 4))) {
      const entityId = row.entity_id;
      const label = row.value;
      if (
        typeof entityId !== "string" ||
        (!entityId.startsWith("work-") && !entityId.startsWith("agent-")) ||
        typeof label !== "string"
      ) continue;
      if (
        !entityId.toLocaleLowerCase().includes(normalized) &&
        !label.toLocaleLowerCase().includes(normalized)
      ) continue;
      const preferred = row.is_preferred === 1 ? 1 : 0;
      const rowId = typeof row.id === "number" ? row.id : Number.MAX_SAFE_INTEGER;
      const current = choices.get(entityId);
      if (!current || preferred > current.preferred || (preferred === current.preferred && rowId < current.id)) {
        choices.set(entityId, { label, preferred, id: rowId });
      }
    }
    return [...choices]
      .map(([id, choice]) => ({
        id,
        label: choice.label,
        family: id.startsWith("work-") ? "work" as const : "agent" as const,
      }))
      .sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id))
      .slice(0, Math.max(0, limit));
  }

  async workStructure(id: string): Promise<{
    memberships: WorkMembership[];
    relations: WorkRelation[];
  }> {
    const memberships = [
      ...await this.#source.matching("work_memberships", "child_work_id", id),
      ...await this.#source.matching("work_memberships", "parent_work_id", id),
    ];
    const membershipIds = new Set<number | string>();
    const projectedMemberships = memberships.flatMap((row) => {
      if (membershipIds.has(row.id as number | string)) return [];
      membershipIds.add(row.id as number | string);
      return [{
        id: typeof row.id === "number" ? `work-membership:${row.id}` : String(row.id),
        childId: String(row.child_work_id),
        parentId: String(row.parent_work_id),
        membershipType: String(row.membership_type) as WorkMembership["membershipType"],
        position: typeof row.position === "number" ? row.position : null,
        positionText: typeof row.position_text === "string" ? row.position_text : null,
      }];
    });
    const relations: WorkRelation[] = [];
    if (this.#shards.tables.work_relations) {
      const rows = [
        ...await this.#source.matching("work_relations", "subject_work_id", id),
        ...await this.#source.matching("work_relations", "object_work_id", id),
      ];
      const seen = new Set<string>();
      for (const row of rows) {
        const relation = {
          subjectId: String(row.subject_work_id),
          objectId: String(row.object_work_id),
          relationType: String(row.relation_type),
        };
        const key = `${relation.subjectId}\0${relation.relationType}\0${relation.objectId}`;
        if (!seen.has(key)) relations.push(relation);
        seen.add(key);
      }
    }
    return { memberships: projectedMemberships, relations };
  }

  async relationsForAgent(id: string): Promise<AgentRelation[]> {
    const rows = [
      ...await this.#source.matching("agent_relations", "subject_agent_id", id),
      ...await this.#source.matching("agent_relations", "object_agent_id", id),
    ];
    const seen = new Set<number | string>();
    return rows.flatMap((row) => {
      if (seen.has(row.id as number | string)) return [];
      seen.add(row.id as number | string);
      return [{
        id: typeof row.id === "number" ? `agent-relation:${row.id}` : String(row.id),
        subjectId: String(row.subject_agent_id),
        objectId: String(row.object_agent_id),
        relationType: String(row.relation_type) as AgentRelation["relationType"],
        fromYear: typeof row.from_year === "number" ? row.from_year : null,
        toYear: typeof row.to_year === "number" ? row.to_year : null,
        periodText: typeof row.period_text === "string" ? row.period_text : null,
        roleText: typeof row.role_text === "string" ? row.role_text : null,
      }];
    });
  }

  asset(kind: keyof ActiveDataManifest["derived"]): string | null {
    const relative = this.manifest.derived[kind];
    return relative ? resolveDataAsset(this.#root, relative).href : null;
  }

  async research(): Promise<ResearchData> {
    const url = this.asset("research");
    if (!url) {
      throw new ProjectionUnavailableError(
        "Research is unavailable for this pinned snapshot; no native research projection was published.",
      );
    }
    const value = await fetchJson(new URL(url), this.#fetch, "force-cache");
    if (!isResearchData(value)) throw new Error("unsupported research projection");
    if (
      value.productSnapshotId !== this.manifest.productSnapshotId ||
      value.product_snapshot.sha256 !== this.manifest.productSha256
    ) {
      throw new Error("research projection belongs to a different product snapshot");
    }
    return value;
  }

  close() {
    this.#source.close();
  }
}

export async function openDemoData(
  root = new URL(`${import.meta.env.BASE_URL}data/`, window.location.origin),
  options: OpenDataOptions = {},
): Promise<DemoDataAdapter> {
  const fetcher: Fetch = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
  const active = parseActiveManifest(
    await fetchJson(resolveDataAsset(root, "active.json"), fetcher, "no-store"),
  );
  const fallbackValue = await fetchVerifiedJson(
    resolveDataAsset(root, active.fallback.file),
    active.fallback.sha256,
    fetcher,
  );
  const shards = parseShardManifest(fallbackValue, active);
  const databaseUrl = resolveDataAsset(root, active.database.file);
  const probe = options.rangeProbe ?? reliableRangeSupport;
  let source: ProductRowSource | null = null;
  const githubPages = root.hostname.endsWith(".github.io");
  if (!githubPages && await probe(databaseUrl, active.database.bytes, fetcher)) {
    try {
      source = await (options.sqliteOpen ?? SqliteHttpSource.open)(root, active, shards);
    } catch (cause) {
      console.warn("SQLite HTTP VFS unavailable; using immutable static shards", cause);
    }
  }
  source ??= new StaticShardSource(root, shards, fetcher);
  return new DemoDataAdapter(root, active, shards, source, fetcher);
}
