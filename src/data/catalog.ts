import { isCatalog } from "../lib/data";
import type {
  Agent,
  AgentRelation,
  Catalog,
  ConceptAssignment,
  Contributor,
  FinancialFact,
  Identifier,
  Manifestation,
  Measurement,
  ProductEvent,
  RemoteAsset,
  Work,
  WorkMembership,
  WorkRelation,
} from "../lib/types";
import type {
  ActiveDataManifest,
  ProductRowSource,
  RawRow,
  ShardManifest,
} from "./contracts";

function text(row: RawRow, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be non-empty text`);
  }
  return value;
}

function nullableText(row: RawRow, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be text or null`);
  return value;
}

function nullableNumber(row: RawRow, field: string): number | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be numeric or null`);
  }
  return value;
}

function nullableBoolean(row: RawRow, field: string): boolean | null {
  const value = row[field];
  if (value === null) return null;
  if (value === 0) return false;
  if (value === 1) return true;
  throw new Error(`${field} must be 0, 1, or null`);
}

function identifier(namespace: string, value: RawRow[string]): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return `${namespace}:${value}`;
  }
  throw new Error(`${namespace} identifier is invalid`);
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}

function parseProductionInfo(value: RawRow[string]): unknown {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function remoteAsset(row: RawRow): RemoteAsset {
  return {
    id: identifier("remote-asset", row.id),
    provider: text(row, "provider"),
    remoteKey: nullableText(row, "remote_key"),
    mediaKind: nullableText(row, "media_kind") as RemoteAsset["mediaKind"],
    directUrl: nullableText(row, "direct_url"),
    sourcePageUrl: nullableText(row, "source_page_url"),
    originProvider: nullableText(row, "origin_provider"),
    originEntityId: nullableText(row, "origin_entity_id"),
    originProperty: nullableText(row, "origin_property"),
    mimeType: nullableText(row, "mime_type"),
    widthPixels: nullableNumber(row, "width_pixels"),
    heightPixels: nullableNumber(row, "height_pixels"),
    licenseId: nullableText(row, "license_id"),
    licenseName: nullableText(row, "license_name"),
    licenseUrl: nullableText(row, "license_url"),
    attributionText: nullableText(row, "attribution_text"),
    authorText: nullableText(row, "author_text"),
    creditText: nullableText(row, "credit_text"),
    rightsStatus: nullableText(row, "rights_status") as RemoteAsset["rightsStatus"],
    displayAllowed: nullableBoolean(row, "display_allowed"),
    rightsNote: nullableText(row, "rights_note"),
  };
}

function preferredNames(rows: RawRow[]): Map<string, string> {
  const choices = new Map<string, { value: string; preferred: number; id: number }>();
  for (const row of rows) {
    const entityId = text(row, "entity_id");
    const value = text(row, "value");
    const preferred = row.is_preferred === 1 ? 1 : 0;
    const id = typeof row.id === "number" ? row.id : Number.MAX_SAFE_INTEGER;
    const current = choices.get(entityId);
    if (!current || preferred > current.preferred || (preferred === current.preferred && id < current.id)) {
      choices.set(entityId, { value, preferred, id });
    }
  }
  return new Map([...choices].map(([entityId, choice]) => [entityId, choice.value]));
}

export async function projectCatalog(
  source: ProductRowSource,
  active: ActiveDataManifest,
  shards: ShardManifest,
): Promise<Catalog> {
  const table = (name: string) => source.all(name);
  const [
    nameRows,
    conceptRows,
    agentRows,
    assignmentRows,
    creditRows,
    advisoryRows,
    measurementRows,
    externalIdRows,
    remoteAssetRows,
    manifestationRows,
    eventRows,
    membershipRows,
    agentRelationRows,
    financialRows,
    workRows,
    workRelationRows,
  ] = await Promise.all([
    table("names"),
    table("concepts"),
    table("agents"),
    table("work_concepts"),
    table("credits"),
    table("parent_guide_assertions"),
    table("measurements"),
    table("external_ids"),
    shards.tables.remote_assets ? table("remote_assets") : Promise.resolve([]),
    table("manifestations"),
    table("events"),
    table("work_memberships"),
    table("agent_relations"),
    table("financial_facts"),
    table("works"),
    shards.tables.work_relations ? table("work_relations") : Promise.resolve([]),
  ]);

  const compareText = (left: RawRow, right: RawRow, field: string) =>
    String(left[field] ?? "").localeCompare(String(right[field] ?? ""));
  const compareNullableNumber = (left: RawRow, right: RawRow, field: string) => {
    const leftValue = left[field];
    const rightValue = right[field];
    if (leftValue === null) return rightValue === null ? 0 : 1;
    if (rightValue === null) return -1;
    return Number(leftValue) - Number(rightValue);
  };
  assignmentRows.sort((left, right) =>
    compareText(left, right, "work_id") ||
    Number(right.centrality ?? 0) - Number(left.centrality ?? 0) ||
    compareText(left, right, "concept_id"));
  creditRows.sort((left, right) =>
    compareText(left, right, "entity_id") ||
    compareNullableNumber(left, right, "credit_order") ||
    compareText(left, right, "role") ||
    compareText(left, right, "agent_id"));
  advisoryRows.sort((left, right) =>
    compareText(left, right, "work_id") ||
    Number(right.intensity ?? 0) - Number(left.intensity ?? 0) ||
    compareText(left, right, "category") ||
    compareText(left, right, "concept_id"));
  manifestationRows.sort((left, right) =>
    compareText(left, right, "work_id") ||
    compareNullableNumber(left, right, "release_year") ||
    compareText(left, right, "entity_id"));
  eventRows.sort((left, right) =>
    compareText(left, right, "entity_id") ||
    compareNullableNumber(left, right, "year_start") ||
    compareText(left, right, "event_type") ||
    Number(left.id ?? 0) - Number(right.id ?? 0));
  financialRows.sort((left, right) =>
    compareText(left, right, "work_id") ||
    compareText(left, right, "fact_type") ||
    compareNullableNumber(left, right, "value_year"));
  workRows.sort((left, right) =>
    compareNullableNumber(left, right, "year_start") ||
    compareText(left, right, "entity_id"));
  remoteAssetRows.sort((left, right) =>
    compareText(left, right, "entity_id") ||
    Number(left.id ?? 0) - Number(right.id ?? 0));

  const names = preferredNames(nameRows);
  const identifiers = new Map<string, Identifier[]>();
  for (const row of externalIdRows) {
    append(identifiers, text(row, "entity_id"), {
      scheme: text(row, "scheme"),
      value: text(row, "value"),
      url: nullableText(row, "canonical_url"),
    });
  }

  const remoteAssets = new Map<string, RemoteAsset[]>();
  for (const row of remoteAssetRows) {
    append(remoteAssets, text(row, "entity_id"), remoteAsset(row));
  }

  const agents = new Map<string, Agent>();
  for (const row of agentRows) {
    const id = text(row, "entity_id");
    agents.set(id, {
      id,
      label: names.get(id) ?? id,
      agentType: text(row, "agent_type") as Agent["agentType"],
      identifiers: identifiers.get(id) ?? [],
      remoteAssets: remoteAssets.get(id) ?? [],
    });
  }

  const concepts = new Map<string, Omit<ConceptAssignment, "relationType" | "centrality" | "centralityScale" | "historicalRole" | "confidence">>();
  for (const row of conceptRows) {
    const id = text(row, "entity_id");
    const slug = text(row, "slug");
    concepts.set(id, {
      id,
      label: names.get(id) ?? slug,
      conceptType: text(row, "concept_type") as ConceptAssignment["conceptType"],
      slug,
    });
  }

  const assignments = new Map<string, ConceptAssignment[]>();
  for (const row of assignmentRows) {
    const concept = concepts.get(text(row, "concept_id"));
    if (!concept) continue;
    append(assignments, text(row, "work_id"), {
      ...concept,
      relationType: text(row, "relation_type") as ConceptAssignment["relationType"],
      centrality: nullableNumber(row, "centrality"),
      centralityScale: text(row, "centrality_scale") as ConceptAssignment["centralityScale"],
      historicalRole: nullableText(row, "historical_role") as ConceptAssignment["historicalRole"],
      confidence: nullableNumber(row, "confidence"),
    });
  }

  const credits = new Map<string, Contributor[]>();
  for (const row of creditRows) {
    const agent = agents.get(text(row, "agent_id"));
    if (!agent) continue;
    append(credits, text(row, "entity_id"), {
      ...agent,
      role: text(row, "role") as Contributor["role"],
      order: nullableNumber(row, "credit_order"),
      importance: text(row, "importance") as Contributor["importance"],
      creditedAs: nullableText(row, "credited_as"),
    });
  }

  const advisories = new Map<string, Work["advisories"]>();
  for (const row of advisoryRows) {
    const concept = concepts.get(text(row, "concept_id"));
    if (!concept) continue;
    append(advisories, text(row, "work_id"), {
      id: identifier("parent-guide", row.id),
      conceptId: concept.id,
      label: concept.label,
      category: text(row, "category") as Work["advisories"][number]["category"],
      intensity: nullableNumber(row, "intensity"),
      explicitness: nullableNumber(row, "explicitness"),
      frequency: nullableNumber(row, "frequency"),
      centrality: nullableNumber(row, "centrality"),
      realism: nullableNumber(row, "realism"),
      spoilerLevel: nullableText(row, "spoiler_level") as Work["advisories"][number]["spoilerLevel"],
      confidence: nullableNumber(row, "confidence"),
    });
  }

  const measurements = new Map<string, Measurement[]>();
  for (const row of measurementRows) {
    append(measurements, text(row, "entity_id"), {
      type: text(row, "measurement_type") as Measurement["type"],
      value: nullableNumber(row, "value") as number,
      unit: nullableText(row, "unit") as Measurement["unit"],
      qualifier: nullableText(row, "qualifier"),
    });
  }

  const events: ProductEvent[] = [];
  const eventsByEntity = new Map<string, ProductEvent[]>();
  for (const row of eventRows) {
    const event: ProductEvent = {
      id: identifier("event", row.id),
      entityId: text(row, "entity_id"),
      eventType: text(row, "event_type") as ProductEvent["eventType"],
      yearStart: nullableNumber(row, "year_start"),
      yearEnd: nullableNumber(row, "year_end"),
      dateText: nullableText(row, "date_text"),
      datePrecision: nullableText(row, "date_precision") as ProductEvent["datePrecision"],
      placeText: nullableText(row, "place_text"),
    };
    events.push(event);
    append(eventsByEntity, event.entityId, event);
  }

  const manifestations = new Map<string, Manifestation[]>();
  for (const row of manifestationRows) {
    const id = text(row, "entity_id");
    append(manifestations, text(row, "work_id"), {
      id,
      type: text(row, "manifestation_type") as Manifestation["type"],
      releaseYear: nullableNumber(row, "release_year"),
      regionCode: nullableText(row, "region_code"),
      languageCode: nullableText(row, "language_code"),
      label: nullableText(row, "label") ?? names.get(id) ?? null,
      contributors: credits.get(id) ?? [],
      events: eventsByEntity.get(id) ?? [],
      remoteAssets: remoteAssets.get(id) ?? [],
    });
  }

  const financialFacts = new Map<string, FinancialFact[]>();
  for (const row of financialRows) {
    append(financialFacts, text(row, "work_id"), {
      type: text(row, "fact_type") as FinancialFact["type"],
      amountMin: nullableNumber(row, "amount_min"),
      amountMax: nullableNumber(row, "amount_max"),
      currencyCode: nullableText(row, "currency_code"),
      valueYear: nullableNumber(row, "value_year"),
      isEstimate: row.is_estimate === 1,
      confidence: nullableNumber(row, "confidence"),
    });
  }

  const works: Work[] = workRows.map((row) => {
    const id = text(row, "entity_id");
    const workConcepts = assignments.get(id) ?? [];
    const missing = workConcepts.filter((concept) => concept.centralityScale === "none").length;
    return {
      id,
      label: names.get(id) ?? id,
      medium: text(row, "medium") as Work["medium"],
      yearStart: nullableNumber(row, "year_start"),
      yearEnd: nullableNumber(row, "year_end"),
      datePrecision: nullableText(row, "date_precision") as Work["datePrecision"],
      dateStartText: nullableText(row, "date_start_text"),
      dateEndText: nullableText(row, "date_end_text"),
      dateQualifier: nullableText(row, "date_qualifier"),
      languageCode: nullableText(row, "language_code"),
      countryCode: nullableText(row, "country_code"),
      productionInfo: parseProductionInfo(row.production_info_json),
      concepts: workConcepts,
      conceptAssignmentCount: workConcepts.length,
      missingCentralityScaleCount: missing,
      missingCentralityScaleFraction: workConcepts.length === 0 ? 0 : missing / workConcepts.length,
      contributors: credits.get(id) ?? [],
      events: eventsByEntity.get(id) ?? [],
      advisories: advisories.get(id) ?? [],
      measurements: measurements.get(id) ?? [],
      identifiers: identifiers.get(id) ?? [],
      remoteAssets: remoteAssets.get(id) ?? [],
      manifestations: manifestations.get(id) ?? [],
      financialFacts: financialFacts.get(id) ?? [],
    };
  });

  const workMemberships: WorkMembership[] = membershipRows.map((row) => ({
    id: identifier("work-membership", row.id),
    childId: text(row, "child_work_id"),
    parentId: text(row, "parent_work_id"),
    membershipType: text(row, "membership_type") as WorkMembership["membershipType"],
    position: nullableNumber(row, "position"),
    positionText: nullableText(row, "position_text"),
  }));
  const agentRelations: AgentRelation[] = agentRelationRows.map((row) => ({
    id: identifier("agent-relation", row.id),
    subjectId: text(row, "subject_agent_id"),
    objectId: text(row, "object_agent_id"),
    relationType: text(row, "relation_type") as AgentRelation["relationType"],
    fromYear: nullableNumber(row, "from_year"),
    toYear: nullableNumber(row, "to_year"),
    periodText: nullableText(row, "period_text"),
    roleText: nullableText(row, "role_text"),
  }));
  const workRelations: WorkRelation[] = workRelationRows.map((row) => ({
    subjectId: text(row, "subject_work_id"),
    objectId: text(row, "object_work_id"),
    relationType: text(row, "relation_type"),
  }));

  const catalog: Catalog = {
    formatVersion: 1,
    productSnapshotId: active.productSnapshotId,
    databaseSha256: active.productSha256,
    agents: [...agents.values()].sort((left, right) => left.id.localeCompare(right.id)),
    works,
    workRelations,
    workMemberships,
    agentRelations,
    events,
  };
  if (!isCatalog(catalog)) {
    throw new Error("pinned product rows do not satisfy the current viewer catalog contract");
  }
  return catalog;
}

/**
 * Build the list/filter read model without loading detail-only tables. Work
 * cards are hydrated through projectWork when opened; graph-heavy views may
 * explicitly request the complete projection.
 */
export async function projectBrowseCatalog(
  source: ProductRowSource,
  active: ActiveDataManifest,
  shards: ShardManifest,
): Promise<Catalog> {
  const selected = new Map<string, RawRow[]>();
  for (const table of [
    "names",
    "concepts",
    "agents",
    "work_concepts",
    "credits",
    "external_ids",
    "works",
  ]) {
    selected.set(table, await source.all(table));
  }
  for (const table of [
    "parent_guide_assertions",
    "measurements",
    "manifestations",
    "events",
    "work_memberships",
    "agent_relations",
    "financial_facts",
    "work_relations",
  ]) {
    selected.set(table, []);
  }
  return projectCatalog(new MemorySource(selected), active, shards);
}

class MemorySource implements ProductRowSource {
  readonly kind = "static-shards" as const;
  readonly #rows: Map<string, RawRow[]>;

  constructor(rows: Map<string, RawRow[]>) {
    this.#rows = rows;
  }

  async all(table: string) {
    return this.#rows.get(table) ?? [];
  }

  async byKey(table: string, value: string) {
    return this.matching(table, table === "works" ? "entity_id" : "id", value);
  }

  async matching(table: string, column: string, value: string) {
    return (this.#rows.get(table) ?? []).filter((row) => row[column] === value);
  }

  async searchNames(query: string, limit: number) {
    const normalized = query.toLocaleLowerCase();
    return (this.#rows.get("names") ?? [])
      .filter((row) => typeof row.value === "string" && row.value.toLocaleLowerCase().includes(normalized))
      .slice(0, limit);
  }

  close() {}
}

async function rowsForEntities(
  source: ProductRowSource,
  table: string,
  entityIds: Iterable<string>,
): Promise<RawRow[]> {
  return (await Promise.all(
    [...new Set(entityIds)].map((id) => source.matching(table, "entity_id", id)),
  )).flat();
}

/** Materialize one work card with targeted key lookups instead of scanning the corpus. */
export async function projectWork(
  source: ProductRowSource,
  active: ActiveDataManifest,
  shards: ShardManifest,
  workId: string,
): Promise<Work | null> {
  const workRows = await source.byKey("works", workId);
  if (workRows.length === 0) return null;
  if (workRows.length !== 1) throw new Error(`work ${workId} is not unique`);
  const [assignmentRows, workCreditRows, advisoryRows, measurementRows, manifestationRows, workEventRows, financialRows] = await Promise.all([
    source.byKey("work_concepts", workId),
    source.byKey("credits", workId),
    source.byKey("parent_guide_assertions", workId),
    source.byKey("measurements", workId),
    source.byKey("manifestations", workId),
    source.byKey("events", workId),
    source.byKey("financial_facts", workId),
  ]);
  const manifestationIds = manifestationRows.map((row) => text(row, "entity_id"));
  const manifestationCredits = (await Promise.all(
    manifestationIds.map((id) => source.byKey("credits", id)),
  )).flat();
  const manifestationEvents = (await Promise.all(
    manifestationIds.map((id) => source.byKey("events", id)),
  )).flat();
  const remoteAssetRows = shards.tables.remote_assets
    ? await rowsForEntities(source, "remote_assets", [workId, ...manifestationIds])
    : [];
  const creditRows = [...workCreditRows, ...manifestationCredits];
  const agentIds = creditRows.map((row) => text(row, "agent_id"));
  const conceptIds = [
    ...assignmentRows.map((row) => text(row, "concept_id")),
    ...advisoryRows.map((row) => text(row, "concept_id")),
  ];
  const [agentRows, conceptRows] = await Promise.all([
    Promise.all([...new Set(agentIds)].map((id) => source.byKey("agents", id))).then((rows) => rows.flat()),
    Promise.all([...new Set(conceptIds)].map((id) => source.byKey("concepts", id))).then((rows) => rows.flat()),
  ]);
  const entityIds = [workId, ...manifestationIds, ...agentIds, ...conceptIds];
  const [nameRows, externalRows] = await Promise.all([
    rowsForEntities(source, "names", entityIds),
    rowsForEntities(source, "external_ids", entityIds),
  ]);
  const selected = new Map<string, RawRow[]>([
    ["names", nameRows],
    ["concepts", conceptRows],
    ["agents", agentRows],
    ["work_concepts", assignmentRows],
    ["credits", creditRows],
    ["parent_guide_assertions", advisoryRows],
    ["measurements", measurementRows],
    ["external_ids", externalRows],
    ["remote_assets", remoteAssetRows],
    ["manifestations", manifestationRows],
    ["events", [...workEventRows, ...manifestationEvents]],
    ["work_memberships", []],
    ["agent_relations", []],
    ["financial_facts", financialRows],
    ["works", workRows],
    ["work_relations", []],
  ]);
  const projected = await projectCatalog(new MemorySource(selected), active, shards);
  return projected.works[0] ?? null;
}

/** Resolve one first-class agent with only its names and external identifiers. */
export async function projectAgent(
  source: ProductRowSource,
  shards: ShardManifest,
  agentId: string,
): Promise<Agent | null> {
  const rows = await source.byKey("agents", agentId);
  if (rows.length === 0) return null;
  if (rows.length !== 1) throw new Error(`agent ${agentId} is not unique`);
  const [names, externalRows, remoteAssetRows] = await Promise.all([
    source.byKey("names", agentId),
    source.byKey("external_ids", agentId),
    shards.tables.remote_assets
      ? source.byKey("remote_assets", agentId)
      : Promise.resolve([]),
  ]);
  const labels = preferredNames(names);
  return {
    id: agentId,
    label: labels.get(agentId) ?? agentId,
    agentType: text(rows[0], "agent_type") as Agent["agentType"],
    identifiers: externalRows.map((row) => ({
      scheme: text(row, "scheme"),
      value: text(row, "value"),
      url: nullableText(row, "canonical_url"),
    })),
    remoteAssets: remoteAssetRows
      .sort((left, right) => Number(left.id ?? 0) - Number(right.id ?? 0))
      .map(remoteAsset),
  };
}
