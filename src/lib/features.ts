import type { EntityId } from "./types";
import type { TasteIndex } from "./taste";

export type FeatureSource =
  | "direct-concept"
  | "contributor"
  | "organization"
  | "content-guide";

export interface WeightedFeature {
  key: string;
  label: string;
  value: number;
  source: FeatureSource;
  category?: string;
  relationType?: string;
}

export interface EdgeFactor {
  id: string;
  label: string;
  contribution: number;
  source: FeatureSource;
  category?: string;
  relationType?: string;
}

export interface FeatureSimilarity {
  similarity: number;
  sharedFeatureCount: number;
  topFactors: EdgeFactor[];
}

export interface FeatureIndex {
  featuresById: Map<EntityId, WeightedFeature[]>;
  vectors: Map<EntityId, Map<string, number>>;
  norms: Map<EntityId, number>;
  documentFrequency: Map<string, number>;
  postings: Map<string, EntityId[]>;
  size: number;
}

function artifactFeatureSource(value: string): FeatureSource {
  return value === "contributor" ||
    value === "organization" ||
    value === "content-guide"
    ? value
    : "direct-concept";
}

/**
 * Hydrate the existing recommendation/similarity API from build-time sparse
 * vectors. This intentionally does not recompute document frequencies or
 * catalog-wide feature distributions in the browser.
 */
export function featureIndexFromTasteIndex(taste: TasteIndex): FeatureIndex {
  const featuresById = new Map<EntityId, WeightedFeature[]>();
  const vectors = new Map<EntityId, Map<string, number>>();
  const norms = new Map<EntityId, number>();
  const documentFrequency = new Map<string, number>();
  const postings = new Map<string, EntityId[]>();

  for (const [id, entity] of taste.entities) {
    if (entity.family !== "work") continue;
    const vector = new Map(entity.features);
    vectors.set(id, vector);
    norms.set(id, entity.norm ?? 0);
    featuresById.set(id, [...vector].map(([key, value]) => {
      const metadata = taste.features.get(key);
      return {
        key,
        label: metadata?.label ?? key,
        value,
        source: artifactFeatureSource(metadata?.source ?? "direct-concept"),
        category: metadata?.category ?? undefined,
        relationType: metadata?.relationType ?? undefined,
      };
    }));
  }

  for (const [key, values] of taste.postings) {
    const ids = [...values.keys()].filter((id) => vectors.has(id));
    postings.set(key, ids);
    documentFrequency.set(key, ids.length);
  }

  return {
    featuresById,
    vectors,
    norms,
    documentFrequency,
    postings,
    size: vectors.size,
  };
}

const CANDIDATE_FEATURE_DF_CAP = 180;

export function similarityBetween(
  index: FeatureIndex,
  leftId: EntityId,
  rightId: EntityId,
  topCount = 4,
): FeatureSimilarity {
  const left = index.vectors.get(leftId);
  const right = index.vectors.get(rightId);
  const leftNorm = index.norms.get(leftId) ?? 0;
  const rightNorm = index.norms.get(rightId) ?? 0;
  if (!left || !right || !leftNorm || !rightNorm) {
    return { similarity: 0, sharedFeatureCount: 0, topFactors: [] };
  }

  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let dot = 0;
  const shared: Array<{ key: string; contribution: number }> = [];

  for (const [key, value] of small) {
    const other = large.get(key);
    if (other === undefined) continue;
    const contribution = value * other;
    dot += contribution;
    shared.push({ key, contribution });
  }

  shared.sort(
    (a, b) => b.contribution - a.contribution || a.key.localeCompare(b.key),
  );
  const metadata = new Map(
    (index.featuresById.get(leftId) ?? []).map((feature) => [feature.key, feature]),
  );

  return {
    similarity: dot / (leftNorm * rightNorm),
    sharedFeatureCount: shared.length,
    topFactors: shared.slice(0, topCount).map(({ key, contribution }) => {
      const feature = metadata.get(key);
      return {
        id: key,
        label: feature?.label ?? key,
        contribution,
        source: feature?.source ?? "direct-concept",
        category: feature?.category,
        relationType: feature?.relationType,
      };
    }),
  };
}

export function similarityCandidates(
  index: FeatureIndex,
  id: EntityId,
  allowed?: ReadonlySet<EntityId>,
): Set<EntityId> {
  const result = new Set<EntityId>();
  const vector = index.vectors.get(id);
  if (!vector) return result;

  for (const key of vector.keys()) {
    if ((index.documentFrequency.get(key) ?? 0) > CANDIDATE_FEATURE_DF_CAP) continue;
    for (const candidate of index.postings.get(key) ?? []) {
      if (candidate === id) continue;
      if (allowed && !allowed.has(candidate)) continue;
      result.add(candidate);
    }
  }
  return result;
}

export function factorPhrase(factor: {
  source: FeatureSource;
  label: string;
  category?: string;
  relationType?: string;
}): string {
  if (factor.source === "direct-concept") {
    return `Shared ${factor.category ? factor.category.replaceAll("_", " ") : "concept"}: ${factor.label}`;
  }
  if (factor.source === "content-guide") {
    return `Similar content profile: ${factor.label}`;
  }
  const role = factor.relationType?.replaceAll("_", " ") ?? "contributor";
  return factor.source === "organization"
    ? `Shared ${role}: ${factor.label}`
    : `Same ${role}: ${factor.label}`;
}
