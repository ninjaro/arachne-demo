import {
  DEFAULT_TAG_STRENGTH_REMAPPING,
  aggregateTagStrength,
  remapTagStrength,
  type AggregateTagStrength,
  type TagStrengthRemappingPolicy,
  type WeightedTagMembership,
} from "./evolution-strength";
import type {
  CentralityScale,
  EntityId,
  Work,
  WorkConceptRelationType,
} from "./types";
import type { EvolutionHierarchyIndex } from "./evolution-hierarchy";

export interface AtomicTrajectoryMembership {
  tagId: EntityId;
  rawStrength: number | null;
  centralityScale: CentralityScale;
  strength: number | null;
  relationType: WorkConceptRelationType;
  historicalRole: string | null;
  confidence: number | null;
}

export type AtomicTrajectoryProfile = Map<EntityId, AtomicTrajectoryMembership>;

export interface AggregateTrajectorySupport {
  tagId: EntityId;
  derived: AggregateTagStrength;
  /** Canonical assignment on the parent itself, never mixed into `derived`. */
  directParentAssignment: AtomicTrajectoryMembership | null;
}

export interface EvolutionAggregateProfile {
  representedWorkIds: EntityId[];
  supportByTagId: Map<EntityId, AggregateTrajectorySupport>;
  homogeneity: number;
  outlierWorkIds: EntityId[];
}

export interface HierarchyCollapseGroup {
  id: string;
  parentId: EntityId;
  membershipType: string;
  representedWorkIds: EntityId[];
  surfacedOutlierWorkIds: EntityId[];
  profile: EvolutionAggregateProfile;
}

export interface EvolutionAggregationPolicy {
  collapseThreshold: number;
  outlierThreshold: number;
}

export const DEFAULT_EVOLUTION_AGGREGATION_POLICY: EvolutionAggregationPolicy = {
  collapseThreshold: 0.72,
  outlierThreshold: 0.45,
};

export function buildAtomicTrajectoryProfile(
  work: Pick<Work, "id" | "concepts">,
  remapping: TagStrengthRemappingPolicy = DEFAULT_TAG_STRENGTH_REMAPPING,
): AtomicTrajectoryProfile {
  const profile: AtomicTrajectoryProfile = new Map();
  for (const assignment of work.concepts.slice().sort((left, right) =>
    left.id.localeCompare(right.id) || left.relationType.localeCompare(right.relationType))) {
    if (profile.has(assignment.id)) continue;
    profile.set(assignment.id, {
      tagId: assignment.id,
      rawStrength: assignment.centrality,
      centralityScale: assignment.centralityScale,
      strength: remapTagStrength(
        assignment.centrality,
        assignment.centralityScale,
        remapping,
      ),
      relationType: assignment.relationType,
      historicalRole: assignment.historicalRole,
      confidence: assignment.confidence,
    });
  }
  return profile;
}

/** Sparse weighted Jaccard; unknown strengths carry no invented weight. */
export function weightedSparseJaccard(
  left: ReadonlyMap<EntityId, AtomicTrajectoryMembership>,
  right: ReadonlyMap<EntityId, AtomicTrajectoryMembership>,
): number {
  const tagIds = new Set([...left.keys(), ...right.keys()]);
  let intersection = 0;
  let union = 0;
  for (const tagId of tagIds) {
    const leftStrength = left.get(tagId)?.strength ?? 0;
    const rightStrength = right.get(tagId)?.strength ?? 0;
    intersection += Math.min(leftStrength, rightStrength);
    union += Math.max(leftStrength, rightStrength);
  }
  return union ? intersection / union : 1;
}

function meanPairwiseSimilarity(
  profiles: readonly AtomicTrajectoryProfile[],
): number {
  if (profiles.length < 2) return 1;
  let sum = 0;
  let count = 0;
  for (let left = 0; left < profiles.length; left += 1) {
    for (let right = left + 1; right < profiles.length; right += 1) {
      sum += weightedSparseJaccard(profiles[left]!, profiles[right]!);
      count += 1;
    }
  }
  return count ? sum / count : 1;
}

export function deriveEvolutionAggregateProfile(
  children: ReadonlyArray<{
    workId: EntityId;
    profile: AtomicTrajectoryProfile;
  }>,
  directParentProfile: AtomicTrajectoryProfile | null = null,
  policy: EvolutionAggregationPolicy = DEFAULT_EVOLUTION_AGGREGATION_POLICY,
): EvolutionAggregateProfile {
  const ordered = children.slice().sort((left, right) =>
    left.workId.localeCompare(right.workId));
  const representedWorkIds = ordered.map((child) => child.workId);
  const tagIds = [...new Set(ordered.flatMap((child) => [...child.profile.keys()]))].sort();
  const supportByTagId = new Map<EntityId, AggregateTrajectorySupport>();
  for (const tagId of tagIds) {
    const memberships: WeightedTagMembership[] = ordered.flatMap((child) => {
      const membership = child.profile.get(tagId);
      return membership ? [{
        tagId,
        workId: child.workId,
        stationId: "",
        strength: membership.strength,
        rawStrength: membership.rawStrength,
        centralityScale: membership.centralityScale,
        relationType: membership.relationType,
        historicalRole: membership.historicalRole,
        confidence: membership.confidence,
      }] : [];
    });
    supportByTagId.set(tagId, {
      tagId,
      derived: aggregateTagStrength(memberships, ordered.length),
      directParentAssignment: directParentProfile?.get(tagId) ?? null,
    });
  }

  const profiles = ordered.map((child) => child.profile);
  const homogeneity = meanPairwiseSimilarity(profiles);
  const outlierWorkIds = ordered
    .filter((child, childIndex) => {
      if (ordered.length < 3) return false;
      const peers = profiles.filter((_, index) => index !== childIndex);
      const similarity = peers.reduce(
        (sum, peer) => sum + weightedSparseJaccard(child.profile, peer),
        0,
      ) / peers.length;
      return similarity < policy.outlierThreshold;
    })
    .map((child) => child.workId);

  return {
    representedWorkIds,
    supportByTagId,
    homogeneity,
    outlierWorkIds,
  };
}

export function aggregateProfileIsCollapsible(
  profile: EvolutionAggregateProfile,
  policy: EvolutionAggregationPolicy = DEFAULT_EVOLUTION_AGGREGATION_POLICY,
): boolean {
  return profile.representedWorkIds.length >= 2 &&
    profile.homogeneity >= policy.collapseThreshold;
}

/**
 * Choose non-overlapping, highest-level homogeneous hierarchy groups. This is
 * projection policy only: callers still traverse the atomic graph first.
 */
export function selectHierarchyCollapseGroups(
  hierarchy: EvolutionHierarchyIndex,
  profileByWorkId: ReadonlyMap<EntityId, AtomicTrajectoryProfile>,
  directProfileByParentId: ReadonlyMap<EntityId, AtomicTrajectoryProfile>,
  protectedWorkIds: ReadonlySet<EntityId> = new Set(),
  focusTagIds: ReadonlySet<EntityId> = new Set(),
  policy: EvolutionAggregationPolicy = DEFAULT_EVOLUTION_AGGREGATION_POLICY,
): HierarchyCollapseGroup[] {
  const candidates: HierarchyCollapseGroup[] = [];
  for (const [parentId, directChildren] of hierarchy.childrenByParentId) {
    const descendants = hierarchy.descendantsOf(parentId);
    const ancestors = new Set(hierarchy.ancestorsOf(parentId));
    if (descendants.some((descendantId) => ancestors.has(descendantId))) continue;
    let representedWorkIds = descendants.filter(
      (workId) => profileByWorkId.has(workId) && !protectedWorkIds.has(workId),
    );
    if (representedWorkIds.length < 2) continue;
    let profile = deriveEvolutionAggregateProfile(
      representedWorkIds.map((workId) => ({
        workId,
        profile: profileByWorkId.get(workId)!,
      })),
      directProfileByParentId.get(parentId) ?? null,
      policy,
    );
    if (!aggregateProfileIsCollapsible(profile, policy)) continue;
    const surfacedOutlierWorkIds = profile.outlierWorkIds.filter((workId) => {
      const childProfile = profileByWorkId.get(workId);
      return childProfile && [...focusTagIds].some((tagId) => childProfile.has(tagId));
    });
    if (surfacedOutlierWorkIds.length) {
      const surfaced = new Set(surfacedOutlierWorkIds);
      representedWorkIds = representedWorkIds.filter((workId) => !surfaced.has(workId));
      if (representedWorkIds.length < 2) continue;
      profile = deriveEvolutionAggregateProfile(
        representedWorkIds.map((workId) => ({
          workId,
          profile: profileByWorkId.get(workId)!,
        })),
        directProfileByParentId.get(parentId) ?? null,
        policy,
      );
      if (!aggregateProfileIsCollapsible(profile, policy)) continue;
    }
    const firstMembership = directChildren
      .map((childId) => hierarchy.membershipByChildId.get(childId))
      .find((membership) => membership !== undefined);
    candidates.push({
      id: `hierarchy:${encodeURIComponent(parentId)}`,
      parentId,
      membershipType: firstMembership?.membershipType ?? "part_of",
      representedWorkIds,
      surfacedOutlierWorkIds,
      profile,
    });
  }

  candidates.sort((left, right) =>
    hierarchy.ancestorsOf(left.parentId).length -
      hierarchy.ancestorsOf(right.parentId).length ||
    right.representedWorkIds.length - left.representedWorkIds.length ||
    left.parentId.localeCompare(right.parentId));
  const claimed = new Set<EntityId>();
  return candidates.filter((candidate) => {
    if (candidate.representedWorkIds.some((workId) => claimed.has(workId))) {
      return false;
    }
    for (const workId of candidate.representedWorkIds) claimed.add(workId);
    return true;
  });
}
