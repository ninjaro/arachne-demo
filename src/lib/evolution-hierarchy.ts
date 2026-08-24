import {
  compareEvolutionDates,
  resolveEvolutionDate,
} from "./evolution-date";
import type { Domain, EntityId, WorkMembership } from "./types";

export interface EvolutionHierarchyIndex {
  parentByChildId: ReadonlyMap<EntityId, EntityId>;
  childrenByParentId: ReadonlyMap<EntityId, readonly EntityId[]>;
  membershipByChildId: ReadonlyMap<EntityId, WorkMembership>;
  ancestorsOf(workId: EntityId): EntityId[];
  descendantsOf(workId: EntityId): EntityId[];
}

const POSITION_TEXT_COLLATOR = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function compareOptionalText(left: string | null, right: string | null): number {
  const normalizedLeft = left?.trim() || null;
  const normalizedRight = right?.trim() || null;
  if (normalizedLeft !== null && normalizedRight === null) return -1;
  if (normalizedLeft === null && normalizedRight !== null) return 1;
  if (normalizedLeft === null || normalizedRight === null) return 0;
  return POSITION_TEXT_COLLATOR.compare(normalizedLeft, normalizedRight);
}

function compareMembershipIdentity(
  left: WorkMembership,
  right: WorkMembership,
): number {
  return (
    left.childId.localeCompare(right.childId) ||
    left.parentId.localeCompare(right.parentId) ||
    left.membershipType.localeCompare(right.membershipType) ||
    (left.position ?? Number.MAX_SAFE_INTEGER) -
      (right.position ?? Number.MAX_SAFE_INTEGER) ||
    compareOptionalText(left.positionText, right.positionText) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Build the canonical work-composition index used by Evolution projection.
 * Invalid endpoints and self-memberships are ignored. If malformed input gives
 * one child multiple parents, a deterministic membership is selected so input
 * order cannot alter the projection.
 */
export function buildEvolutionHierarchyIndex(
  domain: Pick<Domain, "workById" | "workMemberships">,
): EvolutionHierarchyIndex {
  const membershipByChildId = new Map<EntityId, WorkMembership>();
  const memberships = domain.workMemberships
    .filter(
      (membership) =>
        membership.childId !== membership.parentId &&
        domain.workById.has(membership.childId) &&
        domain.workById.has(membership.parentId),
    )
    .sort(compareMembershipIdentity);

  for (const membership of memberships) {
    if (!membershipByChildId.has(membership.childId)) {
      membershipByChildId.set(membership.childId, membership);
    }
  }

  const parentByChildId = new Map<EntityId, EntityId>();
  const membershipsByParentId = new Map<EntityId, WorkMembership[]>();
  for (const membership of membershipByChildId.values()) {
    parentByChildId.set(membership.childId, membership.parentId);
    const siblings = membershipsByParentId.get(membership.parentId);
    if (siblings) siblings.push(membership);
    else membershipsByParentId.set(membership.parentId, [membership]);
  }

  const compareSiblings = (
    left: WorkMembership,
    right: WorkMembership,
  ): number => {
    const leftHasPosition = left.position !== null;
    const rightHasPosition = right.position !== null;
    if (leftHasPosition !== rightHasPosition) return leftHasPosition ? -1 : 1;
    if (left.position !== null && right.position !== null) {
      const positionOrder = left.position - right.position;
      if (positionOrder) return positionOrder;
    }

    const positionTextOrder = compareOptionalText(
      left.positionText,
      right.positionText,
    );
    if (positionTextOrder) return positionTextOrder;

    const leftDate = resolveEvolutionDate(domain.workById.get(left.childId)!);
    const rightDate = resolveEvolutionDate(domain.workById.get(right.childId)!);
    if (leftDate && !rightDate) return -1;
    if (!leftDate && rightDate) return 1;
    if (leftDate && rightDate) {
      const dateOrder = compareEvolutionDates(leftDate, rightDate);
      if (dateOrder) return dateOrder;
    }
    return left.childId.localeCompare(right.childId);
  };

  const childrenByParentId = new Map<EntityId, readonly EntityId[]>();
  for (const [parentId, siblingMemberships] of membershipsByParentId) {
    childrenByParentId.set(
      parentId,
      siblingMemberships.sort(compareSiblings).map((membership) => membership.childId),
    );
  }

  const ancestorsOf = (workId: EntityId): EntityId[] => {
    const ancestors: EntityId[] = [];
    const visited = new Set<EntityId>([workId]);
    let currentId = workId;
    while (true) {
      const parentId = parentByChildId.get(currentId);
      if (!parentId || visited.has(parentId)) break;
      visited.add(parentId);
      ancestors.push(parentId);
      currentId = parentId;
    }
    return ancestors;
  };

  const descendantsOf = (workId: EntityId): EntityId[] => {
    const descendants: EntityId[] = [];
    const visited = new Set<EntityId>([workId]);
    const pending = [...(childrenByParentId.get(workId) ?? [])].reverse();
    while (pending.length) {
      const childId = pending.pop()!;
      if (visited.has(childId)) continue;
      visited.add(childId);
      descendants.push(childId);
      const children = childrenByParentId.get(childId) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        pending.push(children[index]!);
      }
    }
    return descendants;
  };

  return {
    parentByChildId,
    childrenByParentId,
    membershipByChildId,
    ancestorsOf,
    descendantsOf,
  };
}
