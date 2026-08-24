import { useEffect, useId, useMemo, useRef, useState } from "react";
import { EvolutionControls } from "../components/EvolutionControls";
import type { EvolutionTasteFilter as ControlsTasteFilter } from "../components/EvolutionControls";
import { EvolutionCanvas } from "../components/EvolutionCanvas";
import { EvolutionInspector } from "../components/EvolutionInspector";
import {
  EvolutionLegend,
  EvolutionSceneStatus,
} from "../components/EvolutionChrome";
import type { OpenHandler, RateHandler } from "../components/common";
import {
  buildEvolutionIndex,
  buildVisibleEvolution,
  defaultEvolutionSeedTagId,
} from "../lib/evolution";
import type {
  AggregateStation,
  ExpansionMode,
  EvolutionIndex,
  ReachReason,
  VisibleEvolution,
  VisibleEvolutionTag,
} from "../lib/evolution";
import {
  buildEvolutionTooltip,
  buildHoverPresentation,
  buildSelectionPresentation,
  evolutionInteractionAvailable,
  sameEvolutionInteraction,
} from "../lib/evolution-interaction";
import { createDelayedPreviewController } from "../lib/evolution-hover";
import type { DelayedPreviewController } from "../lib/evolution-hover";
import {
  MAX_TRAJECTORY_SEGMENT_WIDTH,
  segmentDisplayStrength,
  trajectorySegmentWidth,
} from "../lib/evolution-strength";
import { buildEvolutionTrajectoryProjection } from "../lib/evolution-trajectory-projection";
import {
  DEFAULT_VISIBLE_TRAJECTORY_LIMIT,
  selectVisibleEvolutionTrajectories,
} from "../lib/evolution-trajectory-selection";
import type { TagTrajectoryGroup } from "../lib/trajectory-bundles";
import { groupUniqueTagLabels, strongestTagSummaries } from "../lib/trajectory-bundles";
import type {
  EvolutionInteractionLayer,
  EvolutionInteractionTarget,
  EvolutionTooltip,
} from "../lib/evolution-interaction";
import {
  aggregateMetroTrajectoryGroupReach,
  buildTimeNetScene,
} from "../lib/timenets";
import type { MetroRenderableTrajectoryGroup, MetroScene } from "../lib/timenets";
import type { Domain, EntityId, Ratings } from "../lib/types";
import { humanize } from "../lib/format";
import {
  deterministicTasteSeedTags,
  inferConceptTaste,
} from "../lib/taste";
import type { TasteIndex } from "../lib/taste";

export {
  evolutionStationMarkerGeometry,
  shouldRenderTemporalRegion,
} from "../components/EvolutionCanvas";
export type { EvolutionStationMarkerGeometry } from "../components/EvolutionCanvas";

const DEFAULT_EARLIER_DEPTH = 0;
const DEFAULT_LATER_DEPTH = 0;
const DEFAULT_EXPANSION_MODE: ExpansionMode = "directional";
const DEFAULT_INCLUDE_YEAR_ONLY = true;
const DEFAULT_INCLUDE_AMBIGUOUS = false;

export type EvolutionTasteFilter = ControlsTasteFilter;

export function tagExcludedByTaste(
  rating: -1 | 1 | undefined,
  filter: EvolutionTasteFilter,
  hideDisliked: boolean,
): boolean {
  return (
    (filter === "positive" && rating !== 1) ||
    (filter === "negative" && rating !== -1) ||
    (filter === "unrated" && rating !== undefined) ||
    (hideDisliked && rating === -1)
  );
}

interface TooltipPosition {
  left: number;
  top: number;
}

interface TraversalProjectionCache {
  index: EvolutionIndex | null;
  byMode: Map<ExpansionMode, { key: string; visible: VisibleEvolution }>;
}

interface ProvenanceGroup {
  key: string;
  reason: ReachReason;
  workIds: EntityId[];
  entries: Array<{ workId: EntityId; reason: ReachReason }>;
  occurrences: number;
}

function tagLabel(index: EvolutionIndex, id: EntityId): string {
  return index.tagById.get(id)?.label ?? id;
}

function strengthValueLabel(strength: number | null): string {
  return strength === null ? "unknown strength" : `${Math.round(strength * 100)}% normalized`;
}

function rawStrengthValuesLabel(values: readonly number[]): string {
  return values.length
    ? `raw source ${values.join(", ")}`
    : "raw source unknown";
}

function rawMembershipStrengths(
  visible: VisibleEvolution,
  tagId: EntityId,
  stationId: string,
): number[] {
  const membership = visible.aggregateMembershipsByTagId
    .get(tagId)
    ?.find((candidate) => candidate.stationId === stationId);
  return [...new Set(
    (membership?.strengthSummary.memberships ?? [])
      .map((source) => source.rawStrength)
      .filter((value): value is number => value !== null),
  )].sort((left, right) => left - right);
}

export function strengthChangesByTemporalGroup<
  T extends { temporalGroupId: string; strength: number | null },
>(profile: readonly T[]): Array<T & { change: number | null; first: boolean }> {
  const temporalGroupIds = [...new Set(
    profile.map((entry) => entry.temporalGroupId),
  )];
  const maximumStrengthByTemporalGroupId = new Map(
    temporalGroupIds.map((temporalGroupId) => {
      const known = profile
        .filter((entry) => entry.temporalGroupId === temporalGroupId)
        .map((entry) => entry.strength)
        .filter((strength): strength is number => strength !== null);
      return [temporalGroupId, known.length ? Math.max(...known) : null];
    }),
  );
  return profile.map((entry) => {
    const groupIndex = temporalGroupIds.indexOf(entry.temporalGroupId);
    const previousStrength = groupIndex > 0
      ? maximumStrengthByTemporalGroupId.get(temporalGroupIds[groupIndex - 1]!) ?? null
      : null;
    return {
      ...entry,
      change:
        previousStrength !== null && entry.strength !== null
          ? entry.strength - previousStrength
          : null,
      first: groupIndex === 0,
    };
  });
}

export function normalizedStrengthRangeLabel(
  minimum: number | null,
  maximum: number | null,
  median: number | null,
): string {
  if (minimum === null || maximum === null) return "normalized range unknown";
  const range = `normalized range ${Math.round(minimum * 100)}–${Math.round(maximum * 100)}%`;
  return median === null ? range : `${range} · median ${Math.round(median * 100)}%`;
}

function reasonKey(reason: ReachReason): string {
  return JSON.stringify(reason);
}

function provenanceGroupKey(reason: ReachReason): string {
  const record = reason as unknown as Record<string, unknown>;
  return JSON.stringify([
    reason.kind,
    record.seedTagId ?? null,
    record.direction ?? null,
    record.sourceStationId ??
      record.sourceStopId ??
      record.fromStationId ??
      record.stopId ??
      record.fromWorkId ??
      null,
    record.viaTagId ?? record.tagId ?? null,
    record.resultingDepth ?? record.depth ?? null,
    record.context ?? null,
  ]);
}


/** Count group-deduplicated traversal states that actually contain a station. */
export function connectedContextStateCountForStation(
  visible: Pick<VisibleEvolution, "contextTraversalStates" | "temporalTagStops">,
  stationId: string,
): number {
  const memberships = new Set(
    visible.temporalTagStops
      .filter((stop) => stop.stationIds.includes(stationId))
      .map((stop) => `${stop.tagId}\u0000${stop.temporalGroupId}`),
  );
  return visible.contextTraversalStates.filter((state) =>
    memberships.has(`${state.tagId}\u0000${state.temporalGroupId}`),
  ).length;
}

export const MAX_UNSELECTED_TRAJECTORY_WIDTH =
  MAX_TRAJECTORY_SEGMENT_WIDTH;


/** Reuse base geometry while recomputing metadata for an overlay-split group. */
export function evolutionRenderGroupFallback(
  group: TagTrajectoryGroup,
  scene: MetroScene,
  visible: VisibleEvolution,
): MetroRenderableTrajectoryGroup | null {
  const representative = scene.trajectoryById.get(group.tagIds[0]!);
  if (!representative) return null;
  const reachMembers = group.tagIds
    .map((tagId) => visible.tagById.get(tagId))
    .filter((member): member is VisibleEvolutionTag => Boolean(member));
  if (!reachMembers.length) return null;
  const maximumGroupStrength = (stationId: string | null): number | null => {
    if (!stationId) return null;
    const known = group.tagIds
      .map((tagId) => visible.aggregateMembershipsByTagId
        .get(tagId)
        ?.find((membership) => membership.stationId === stationId)
        ?.strength ?? null)
      .filter((strength): strength is number => strength !== null);
    return known.length ? Math.max(...known) : null;
  };
  return {
    id: group.id,
    kind: group.kind,
    tagIds: [...group.tagIds],
    stationIds: representative.stationIds,
    path: representative.path,
    color: representative.color,
    stationPorts: representative.stationPorts,
    segments: representative.segments.map((segment) => {
      const sourceStrength = maximumGroupStrength(segment.sourceStationId);
      const targetStrength = maximumGroupStrength(segment.targetStationId);
      const displayStrength = segmentDisplayStrength(
        sourceStrength,
        targetStrength,
      );
      return {
        ...segment,
        sourceStrength,
        targetStrength,
        displayStrength,
        width: trajectorySegmentWidth(displayStrength),
      };
    }),
    reach: aggregateMetroTrajectoryGroupReach(reachMembers),
  };
}

/** Station/relation selection highlights existing bundles without exploding them. */
export function provenanceOverlayTagIds(
  selection: EvolutionInteractionTarget | null,
  presentation: Pick<EvolutionInteractionLayer, "provenanceTagIds"> | null,
): EntityId[] {
  return selection?.kind === "tag"
    ? [...(presentation?.provenanceTagIds ?? [])]
    : [];
}

export function nextIsolatedTagId(
  current: EntityId | null,
  target: EvolutionInteractionTarget,
  baseBundleIds: ReadonlySet<string>,
): EntityId | null {
  if (target.kind === "tag") return target.id;
  if (target.kind === "bundle" && !baseBundleIds.has(target.id)) return current;
  return null;
}

export function evolutionItemInteractionClasses({
  kind,
  id,
  selection,
  hover,
  selectionLayer,
  hoverLayer,
  selectionLookup,
  hoverLookup,
}: {
  kind: EvolutionInteractionTarget["kind"];
  id: string;
  selection: EvolutionInteractionTarget | null;
  hover: EvolutionInteractionTarget | null;
  selectionLayer: EvolutionInteractionLayer | null;
  hoverLayer: EvolutionInteractionLayer | null;
  selectionLookup?: EvolutionInteractionLookup | null;
  hoverLookup?: EvolutionInteractionLookup | null;
}): string[] {
  const key =
    kind === "tag"
      ? "tagIds"
      : kind === "bundle"
        ? "bundleIds"
        : kind === "station"
          ? "stationIds"
          : "relationKeys";
  const exactSelection = sameEvolutionInteraction(
    selection,
    { kind, id } as EvolutionInteractionTarget,
  );
  const exactHover = sameEvolutionInteraction(
    hover,
    { kind, id } as EvolutionInteractionTarget,
  );
  const selectionRelated = selectionLookup
    ? selectionLookup[key].has(id)
    : new Set(selectionLayer?.[key] ?? []).has(id);
  const previewRelated = hoverLookup
    ? hoverLookup[key].has(id)
    : new Set(hoverLayer?.[key] ?? []).has(id);
  const muted = Boolean(
    selectionLayer?.muteUnrelated && !selectionRelated && !previewRelated,
  );
  return [
    exactSelection ? "selected" : "",
    selectionRelated ? "selection-related" : "",
    exactHover ? "previewed" : "",
    previewRelated && !exactHover ? "preview-related" : "",
    muted ? "muted-by-selection" : "",
  ].filter(Boolean);
}

export interface EvolutionInteractionLookup {
  tagIds: ReadonlySet<string>;
  bundleIds: ReadonlySet<string>;
  stationIds: ReadonlySet<string>;
  relationKeys: ReadonlySet<string>;
}

export function evolutionInteractionLookup(
  layer: EvolutionInteractionLayer | null,
): EvolutionInteractionLookup {
  return {
    tagIds: new Set(layer?.tagIds ?? []),
    bundleIds: new Set(layer?.bundleIds ?? []),
    stationIds: new Set(layer?.stationIds ?? []),
    relationKeys: new Set(layer?.relationKeys ?? []),
  };
}


function groupStationProvenance(
  station: AggregateStation,
  visible: VisibleEvolution,
): ProvenanceGroup[] {
  const groups = new Map<string, ProvenanceGroup>();
  const add = (reason: ReachReason, workId?: EntityId) => {
    const key = provenanceGroupKey(reason);
    let group = groups.get(key);
    if (!group) {
      group = { key, reason, workIds: [], entries: [], occurrences: 0 };
      groups.set(key, group);
    }
    group.occurrences += 1;
    if (workId) {
      if (!group.workIds.includes(workId)) group.workIds.push(workId);
      const entryKey = `${workId}\u0000${reasonKey(reason)}`;
      if (!group.entries.some((entry) => `${entry.workId}\u0000${reasonKey(entry.reason)}` === entryKey)) {
        group.entries.push({ workId, reason });
      }
    }
  };
  for (const reason of station.reasons) add(reason);
  for (const workId of station.workIds) {
    for (const reason of visible.workById.get(workId)?.reasons ?? []) {
      add(reason, workId);
    }
    for (const membership of visible.membershipsByWorkId.get(workId) ?? []) {
      if (!station.visibleTagIds.includes(membership.tagId)) continue;
      for (const reason of membership.reasons) add(reason, workId);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      workIds: group.workIds.sort(),
      entries: group.entries.sort(
        (left, right) =>
          left.workId.localeCompare(right.workId) ||
          reasonKey(left.reason).localeCompare(reasonKey(right.reason)),
      ),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function tooltipPositionFor(node: SVGGElement): TooltipPosition {
  const rect = node.getBoundingClientRect();
  const width = 340;
  const height = 360;
  const viewportWidth = globalThis.window?.innerWidth ?? rect.right + width;
  const viewportHeight = globalThis.window?.innerHeight ?? rect.bottom + height;
  return {
    left: Math.max(8, Math.min(rect.right + 10, viewportWidth - width - 8)),
    top: Math.max(8, Math.min(rect.top, viewportHeight - height - 8)),
  };
}

function Tooltip({
  id,
  tooltip,
  position,
  onPointerEnter,
  onPointerLeave,
}: {
  id: string;
  tooltip: EvolutionTooltip;
  position: TooltipPosition;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  return (
    <div
      id={id}
      className="metro-hover-tooltip"
      role="tooltip"
      data-evolution-local-preview="true"
      style={{ left: position.left, top: position.top }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {tooltip.kind === "tag" ? (
        <>
          <strong>{tooltip.label}</strong>
          <small>{tooltip.stationCount} aggregate stops · {tooltip.workCount} works</small>
          <ul>
            {tooltip.strengthProfile.map((entry) => (
              <li key={entry.stationId}>
                {entry.acceptedTemporalValue} · {entry.strengthBand} · {strengthValueLabel(entry.strength)} · {rawStrengthValuesLabel(entry.rawStrengths)}
              </li>
            ))}
          </ul>
        </>
      ) : tooltip.kind === "bundle" ? (
        <>
          <strong>{tooltip.tagCount} bundled tags</strong>
          <span>{tooltip.stationCount} shared aggregate stops</span>
          <small>{tooltip.reason}</small>
          <ul>
            {tooltip.tags.map((tag) => (
              <li key={tag.id}>
                {tag.label} · {tag.strengthBand} · {strengthValueLabel(tag.strongestStrength)} · {rawStrengthValuesLabel(tag.rawStrengths)}
              </li>
            ))}
          </ul>
          {tooltip.hiddenTagCount ? (
            <small>
              {tooltip.hiddenTagCount} more {tooltip.hiddenTagCount === 1 ? "tag" : "tags"}. Select the bundle for the complete unique list.
            </small>
          ) : null}
        </>
      ) : tooltip.kind === "station" ? (
        <>
          <strong>{tooltip.aggregate ? `${tooltip.workCount} works` : tooltip.works[0]?.label}</strong>
          <span>{tooltip.acceptedTemporalValue} · {tooltip.dateQuality}</span>
          {tooltip.flexiblePlacementNote ? <small>{tooltip.flexiblePlacementNote}</small> : null}
          <small>
            {tooltip.visibleTagGroups.map((group) =>
              `${group.label}${group.conceptRecordCount > 1 ? ` (${group.conceptRecordCount} concept records)` : ""}`,
            ).join(" · ")}
          </small>
          {tooltip.ambiguityReasons.length ? (
            <small>{tooltip.ambiguityReasons.join("; ")}</small>
          ) : null}
          <ul className="metro-tooltip-strengths">
            {tooltip.visibleTagGroups.map((group) => {
              const records = tooltip.visibleTags.filter((tag) => group.tagIds.includes(tag.id));
              const rawValues = [...new Set(records.flatMap((tag) => tag.rawStrengths))]
                .sort((left, right) => left - right);
              const minimums = records
                .map((tag) => tag.minimumStrength)
                .filter((value): value is number => value !== null);
              const maximums = records
                .map((tag) => tag.maximumStrength)
                .filter((value): value is number => value !== null);
              const medians = records
                .map((tag) => tag.medianStrength)
                .filter((value): value is number => value !== null);
              const minimum = minimums.length ? Math.min(...minimums) : null;
              const maximum = maximums.length ? Math.max(...maximums) : null;
              const median = medians.length === 1 ? medians[0]! : null;
              const maximumWorkIds = [...new Set(
                records
                  .filter((tag) => maximum !== null && tag.maximumStrength === maximum)
                  .flatMap((tag) => tag.maxWorkIds),
              )];
              const maximumWorkLabels = maximumWorkIds
                .map((workId) => tooltip.works.find((work) => work.id === workId)?.label ?? workId)
                .sort((left, right) => left.localeCompare(right));
              return (
                <li key={group.normalizedLabel}>
                  {group.label} · {strengthValueLabel(group.strongestStrength)}
                  <small>
                    {normalizedStrengthRangeLabel(minimum, maximum, median)}
                    {maximumWorkLabels.length ? ` · maximum from ${maximumWorkLabels.join(", ")}` : " · maximum source unknown"}
                    {rawValues.length ? ` · raw ${rawValues.join(", ")}` : " · raw unavailable"}
                  </small>
                </li>
              );
            })}
          </ul>
          <ul>
            {tooltip.works.map((work) => <li key={work.id}>{work.label}</li>)}
          </ul>
        </>
      ) : (
        <>
          <strong>{tooltip.relationCount} explicit {tooltip.relationCount === 1 ? "relation" : "relations"}</strong>
          <span>{tooltip.relationTypes.map(humanize).join(" · ")}</span>
          {tooltip.chronologyConflictCount ? (
            <small>{tooltip.chronologyConflictCount} chronology {tooltip.chronologyConflictCount === 1 ? "conflict" : "conflicts"}</small>
          ) : null}
          <small>
            {tooltip.sharedTags.length} shared unique {tooltip.sharedTags.length === 1 ? "tag" : "tags"}
            {tooltip.sharedTags.length
              ? ` · strongest ${tooltip.sharedTags.slice(0, 3).map((tag) => `${tag.label} (${strengthValueLabel(tag.strength)})`).join(", ")}`
              : ""}
          </small>
          <ul>
            {tooltip.endpoints.map((endpoint) => (
              <li key={endpoint.key}>
                {endpoint.sourceLabel} → {endpoint.targetLabel} · {humanize(endpoint.relationType)}
                {endpoint.chronologyConflict ? " · chronology conflict" : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function EvolutionView({
  domain,
  ratings,
  onRate,
  tasteIndex = null,
  requestedTagId = null,
  onRequestedTagHandled,
  onOpen,
}: {
  domain: Domain;
  ratings: Ratings;
  onRate: RateHandler;
  tasteIndex?: TasteIndex | null;
  requestedTagId?: EntityId | null;
  onRequestedTagHandled?: (id: EntityId) => void;
  onOpen: OpenHandler;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const detailsId = useId();
  const tooltipId = useId();
  const index = useMemo(() => buildEvolutionIndex(domain), [domain]);
  const defaultSeedId = useMemo(
    () =>
      defaultEvolutionSeedTagId(index, {
        includeYearOnly: DEFAULT_INCLUDE_YEAR_ONLY,
        includeAmbiguous: DEFAULT_INCLUDE_AMBIGUOUS,
      }),
    [index],
  );
  const [seedTagIds, setSeedTagIds] = useState<EntityId[]>(() =>
    defaultSeedId ? [defaultSeedId] : [],
  );
  const [excludedTagIds, setExcludedTagIds] = useState<EntityId[]>([]);
  const [tasteFilter, setTasteFilter] = useState<EvolutionTasteFilter>("all");
  const [hideDislikedTags, setHideDislikedTags] = useState(false);
  const [showInferredPreference, setShowInferredPreference] = useState(true);
  const [earlierDepth, setEarlierDepth] = useState(DEFAULT_EARLIER_DEPTH);
  const [laterDepth, setLaterDepth] = useState(DEFAULT_LATER_DEPTH);
  const [expansionMode, setExpansionMode] = useState<ExpansionMode>(DEFAULT_EXPANSION_MODE);
  const [includeYearOnly, setIncludeYearOnly] = useState(DEFAULT_INCLUDE_YEAR_ONLY);
  const [includeAmbiguous, setIncludeAmbiguous] = useState(DEFAULT_INCLUDE_AMBIGUOUS);
  const [zoom, setZoom] = useState(1);
  const [selection, setSelection] = useState<EvolutionInteractionTarget | null>(null);
  const [hover, setHover] = useState<EvolutionInteractionTarget | null>(null);
  const [focusTarget, setFocusTarget] = useState<EvolutionInteractionTarget | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>({ left: 8, top: 8 });
  const [refinedWorkId, setRefinedWorkId] = useState<EntityId | null>(null);
  const [explicitExpandedTagIds, setExplicitExpandedTagIds] = useState<EntityId[]>([]);
  const [expandedHierarchyParentIds, setExpandedHierarchyParentIds] = useState<EntityId[]>([]);
  const [pinnedTagIds, setPinnedTagIds] = useState<EntityId[]>([]);
  const [isolatedTagId, setIsolatedTagId] = useState<EntityId | null>(null);
  const [visibleTrajectoryLimit, setVisibleTrajectoryLimit] = useState(
    DEFAULT_VISIBLE_TRAJECTORY_LIMIT,
  );
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const inferredConceptTaste = useMemo(
    () => inferConceptTaste(domain, ratings, tasteIndex),
    [domain, ratings, tasteIndex],
  );
  const inferredByConceptId = useMemo(
    () => new Map(inferredConceptTaste.map((entry) => [entry.conceptId, entry])),
    [inferredConceptTaste],
  );
  const traversalCache = useRef<TraversalProjectionCache>({
    index: null,
    byMode: new Map(),
  });
  const hoverController = useRef<DelayedPreviewController<EvolutionInteractionTarget> | null>(null);
  const detailsPanelRef = useRef<HTMLElement | null>(null);
  const focusDetailsAfterUpdate = useRef(false);
  if (!hoverController.current) {
    hoverController.current = createDelayedPreviewController({
      isSameTarget: (left, right) => sameEvolutionInteraction(left, right),
      onOpen: (target) => setHover(target),
      onClose: (target) => {
        setHover((current) =>
          target === null || sameEvolutionInteraction(current, target)
            ? null
            : current,
        );
      },
    });
  }

  useEffect(() => {
    if (!requestedTagId) return;
    if (!index.tagById.has(requestedTagId)) {
      onRequestedTagHandled?.(requestedTagId);
      return;
    }
    setExcludedTagIds((current) =>
      current.filter((candidate) => candidate !== requestedTagId),
    );
    setSeedTagIds((current) =>
      current.includes(requestedTagId) ? current : [...current, requestedTagId],
    );
    setSelection({ kind: "tag", id: requestedTagId });
    setFocusTarget({ kind: "tag", id: requestedTagId });
    setInspectorOpen(true);
    onRequestedTagHandled?.(requestedTagId);
  }, [index, onRequestedTagHandled, requestedTagId]);

  const effectiveExcludedTagIds = useMemo(() => {
    const excluded = new Set(excludedTagIds);
    for (const tag of index.tagOptions) {
      const value = ratings[tag.id];
      const filtered = tagExcludedByTaste(value, tasteFilter, hideDislikedTags);
      if (filtered) excluded.add(tag.id);
    }
    return [...excluded];
  }, [excludedTagIds, hideDislikedTags, index.tagOptions, ratings, tasteFilter]);

  const hierarchyFocusTagIds = useMemo(() => [
    ...new Set([
      ...seedTagIds,
      ...pinnedTagIds,
      ...(selection?.kind === "tag" ? [selection.id] : []),
      ...(isolatedTagId ? [isolatedTagId] : []),
    ]),
  ].sort(), [isolatedTagId, pinnedTagIds, seedTagIds, selection]);

  const filters = useMemo(
    () => ({
      seedTagIds,
      excludedTagIds: effectiveExcludedTagIds,
      earlierDepth,
      laterDepth,
      expansionMode,
      includeYearOnly,
      includeAmbiguous,
      expandedHierarchyParentIds,
      hierarchyFocusTagIds,
    }),
    [
      earlierDepth,
      expansionMode,
      expandedHierarchyParentIds,
      effectiveExcludedTagIds,
      includeAmbiguous,
      includeYearOnly,
      hierarchyFocusTagIds,
      laterDepth,
      seedTagIds,
    ],
  );
  const traversalCacheKey = useMemo(
    () => JSON.stringify([
      seedTagIds,
      effectiveExcludedTagIds.slice().sort(),
      earlierDepth,
      laterDepth,
      includeYearOnly,
      includeAmbiguous,
      expandedHierarchyParentIds,
      hierarchyFocusTagIds,
    ]),
    [
      earlierDepth,
      effectiveExcludedTagIds,
      expandedHierarchyParentIds,
      includeAmbiguous,
      includeYearOnly,
      hierarchyFocusTagIds,
      laterDepth,
      seedTagIds,
    ],
  );
  if (traversalCache.current.index !== index) {
    traversalCache.current = { index, byMode: new Map() };
  }
  let cachedTraversal = traversalCache.current.byMode.get(expansionMode);
  if (!cachedTraversal || cachedTraversal.key !== traversalCacheKey) {
    cachedTraversal = {
      key: traversalCacheKey,
      visible: buildVisibleEvolution(index, filters),
    };
    traversalCache.current.byMode.set(expansionMode, cachedTraversal);
  }
  // Directional and connected projections occupy independent cache slots so
  // toggling modes can reuse the last result for unchanged budgets and seeds.
  const eligibleVisible = cachedTraversal.visible;
  const requiredTrajectoryTagIds = useMemo(() => {
    const required = new Set<EntityId>([
      ...seedTagIds,
      ...pinnedTagIds,
      ...explicitExpandedTagIds,
    ]);
    if (selection?.kind === "tag") required.add(selection.id);
    if (isolatedTagId) required.add(isolatedTagId);
    if (requestedTagId) required.add(requestedTagId);
    return [...required].sort();
  }, [
    explicitExpandedTagIds,
    isolatedTagId,
    pinnedTagIds,
    requestedTagId,
    seedTagIds,
    selection,
  ]);
  const trajectorySelection = useMemo(
    () => selectVisibleEvolutionTrajectories(eligibleVisible, {
      maximumVisible: visibleTrajectoryLimit,
      requiredTagIds: requiredTrajectoryTagIds,
    }),
    [eligibleVisible, requiredTrajectoryTagIds, visibleTrajectoryLimit],
  );
  const visible = trajectorySelection.visible;
  const baseTrajectoryProjection = useMemo(
    () => buildEvolutionTrajectoryProjection(visible, {
      expandedTagIds: explicitExpandedTagIds,
    }),
    [explicitExpandedTagIds, visible],
  );
  const scene = useMemo(
    () => buildTimeNetScene(visible, baseTrajectoryProjection.groups),
    [baseTrajectoryProjection.groups, visible],
  );
  const selectedProjectionTagId = selection?.kind === "tag"
    ? selection.id
    : isolatedTagId;
  const baseSelectionProjection = useMemo(
    () => buildSelectionPresentation(scene, selection),
    [scene, selection],
  );
  const provenanceRequiredTagIds = provenanceOverlayTagIds(
    selection,
    baseSelectionProjection,
  );
  const provenanceProjectionKey = provenanceRequiredTagIds.join("\u0000");
  const renderTrajectoryProjection = useMemo(
    () => {
      if (!selectedProjectionTagId && !provenanceRequiredTagIds.length) {
        return baseTrajectoryProjection;
      }
      return buildEvolutionTrajectoryProjection(visible, {
        expandedTagIds: explicitExpandedTagIds,
        selectedTagId: selectedProjectionTagId,
        provenanceRequiredTagIds,
      });
    },
    [
      baseTrajectoryProjection,
      explicitExpandedTagIds,
      provenanceProjectionKey,
      selectedProjectionTagId,
      visible,
    ],
  );
  const renderTrajectoryGroups = useMemo(
    () => renderTrajectoryProjection.groups
      .map((group): (MetroRenderableTrajectoryGroup & { model: TagTrajectoryGroup }) | null => {
        const laidOut = scene.trajectoryGroupById.get(group.id);
        if (laidOut) return { ...laidOut, model: group };
        const fallback = evolutionRenderGroupFallback(group, scene, visible);
        return fallback ? { ...fallback, model: group } : null;
      })
      .filter(
        (group): group is MetroRenderableTrajectoryGroup & { model: TagTrajectoryGroup } =>
          group !== null,
      ),
    [renderTrajectoryProjection.groups, scene, visible],
  );
  const interactionScene = useMemo(
    () => ({
      ...scene,
      trajectoryGroups: renderTrajectoryGroups,
      trajectoryGroupById: new Map(
        renderTrajectoryGroups.map((group) => [group.id, group]),
      ),
    }),
    [renderTrajectoryGroups, scene],
  );
  const hoverPresentation = useMemo(
    () => buildHoverPresentation(interactionScene, hover),
    [hover, interactionScene],
  );
  const selectionPresentation = useMemo(
    () => buildSelectionPresentation(interactionScene, selection),
    [interactionScene, selection],
  );
  const presentation = useMemo(
    () => ({
      hover: hoverPresentation,
      selection: selectionPresentation,
      tooltipTarget: hoverPresentation?.target ?? null,
      detailsTarget: selectionPresentation?.target ?? null,
    }),
    [hoverPresentation, selectionPresentation],
  );
  const selectionInteractionLookup = useMemo(
    () => evolutionInteractionLookup(presentation.selection),
    [presentation.selection],
  );
  const hoverInteractionLookup = useMemo(
    () => evolutionInteractionLookup(presentation.hover),
    [presentation.hover],
  );
  const tooltip = useMemo(
    () => buildEvolutionTooltip(interactionScene, visible, presentation.tooltipTarget),
    [interactionScene, presentation.tooltipTarget, visible],
  );

  const fallbackTrajectoryGroup = renderTrajectoryGroups[0] ?? null;
  const fallbackFocusTarget: EvolutionInteractionTarget | null = fallbackTrajectoryGroup
    ? fallbackTrajectoryGroup.kind === "bundle"
      ? { kind: "bundle", id: fallbackTrajectoryGroup.id }
      : { kind: "tag", id: fallbackTrajectoryGroup.tagIds[0]! }
    : scene.stations[0]
      ? { kind: "station", id: scene.stations[0].id }
      : scene.explicitRelations[0]
        ? { kind: "relation", id: scene.explicitRelations[0].key }
        : null;
  const rovingFocusTarget = evolutionInteractionAvailable(interactionScene, focusTarget)
    ? focusTarget
    : fallbackFocusTarget;

  useEffect(() => {
    if (selection && !evolutionInteractionAvailable(interactionScene, selection)) {
      setSelection(null);
      setIsolatedTagId(null);
    }
    if (hover && !evolutionInteractionAvailable(interactionScene, hover)) setHover(null);
    if (focusTarget && !evolutionInteractionAvailable(interactionScene, focusTarget)) {
      setFocusTarget(null);
    }
    if (isolatedTagId && !visible.tagById.has(isolatedTagId)) {
      setIsolatedTagId(null);
    }
  }, [focusTarget, hover, interactionScene, isolatedTagId, selection, visible]);

  useEffect(
    () => () => {
      hoverController.current?.dispose();
    },
    [],
  );

  const selectedTarget = presentation.detailsTarget;
  const selectedTag =
    selectedTarget?.kind === "tag"
      ? visible.tagById.get(selectedTarget.id) ?? null
      : null;
  const selectedInferredPreference = selectedTag
    ? inferredByConceptId.get(selectedTag.tag.id) ?? null
    : null;
  const selectedBundle =
    selectedTarget?.kind === "bundle"
      ? renderTrajectoryProjection.bundles.find((bundle) => bundle.id === selectedTarget.id) ?? null
      : null;
  const selectedBundleRouteStationIds = selectedBundle
    ? interactionScene.trajectoryGroupById.get(selectedBundle.id)?.stationIds ??
      selectedBundle.stationIds
    : [];
  const selectedBundleTagGroups = useMemo(
    () => selectedBundle
      ? groupUniqueTagLabels(selectedBundle.entries.map((entry) => ({
          tagId: entry.tagId,
          label: entry.label,
          strength: entry.strengthProfile
            .filter((strength): strength is number => strength !== null)
            .reduce<number | null>(
              (maximum, strength) => maximum === null ? strength : Math.max(maximum, strength),
              null,
            ),
        })))
      : [],
    [selectedBundle],
  );
  const selectedStation =
    selectedTarget?.kind === "station"
      ? scene.stationById.get(selectedTarget.id) ?? null
      : null;
  const selectedHierarchyParent = selectedStation?.entry.hierarchyParentId
    ? index.domain.workById.get(selectedStation.entry.hierarchyParentId) ?? null
    : null;
  const selectedExpandedHierarchyParentId = selectedStation?.entry.workIds.length === 1
    ? index.hierarchy.ancestorsOf(selectedStation.entry.workIds[0]!).find((parentId) =>
        expandedHierarchyParentIds.includes(parentId)) ?? null
    : null;
  const selectedRelation =
    selectedTarget?.kind === "relation"
      ? scene.explicitRelations.find((entry) => entry.key === selectedTarget.id) ?? null
      : null;
  const selectedAggregateMemberships = selectedStation
    ? visible.aggregateMembershipsByStationId.get(selectedStation.id) ?? []
    : [];
  const selectedStationBundles = selectedStation
    ? (baseTrajectoryProjection.groupsByStationId.get(selectedStation.id) ?? [])
        .filter((group) => group.kind === "bundle")
    : [];
  const selectedVisibleTagGroups = useMemo(
    () => groupUniqueTagLabels(
      selectedAggregateMemberships.map((membership) => ({
        tagId: membership.tagId,
        label: tagLabel(index, membership.tagId),
        strength: membership.strength,
      })),
    ),
    [index, selectedAggregateMemberships],
  );
  const selectedUnderlyingAssignments = useMemo(
    () => selectedAggregateMemberships
      .flatMap((membership) => membership.strengthSummary.memberships.map((source) => ({
        ...source,
        label: tagLabel(index, membership.tagId),
      })))
      .sort(
        (left, right) =>
          left.label.localeCompare(right.label) ||
          left.tagId.localeCompare(right.tagId) ||
          left.workId.localeCompare(right.workId),
      ),
    [index, selectedAggregateMemberships],
  );
  const selectedTagStrengthProfile = useMemo(
    () => {
      if (!selectedTag) return [];
      const renderedStationIds = scene.trajectoryById.get(selectedTag.tag.id)?.stationIds ??
        selectedTag.stationIds;
      const temporalGroupIdByStationId = new Map<string, string>();
      for (const stop of visible.temporalTagStops) {
        if (stop.tagId !== selectedTag.tag.id) continue;
        for (const stationId of stop.stationIds) {
          temporalGroupIdByStationId.set(stationId, stop.temporalGroupId);
        }
      }
      const profile = renderedStationIds.map((stationId) => {
          const membership = visible.aggregateMembershipsByTagId
            .get(selectedTag.tag.id)
            ?.find((candidate) => candidate.stationId === stationId);
          return {
            stationId,
            temporalGroupId: temporalGroupIdByStationId.get(stationId) ??
              `station:${stationId}`,
            label: scene.stationById.get(stationId)?.entry.temporal.displayLabel ?? stationId,
            strength: membership?.strength ?? null,
            rawStrengths: rawMembershipStrengths(
              visible,
              selectedTag.tag.id,
              stationId,
            ),
          };
        });
      return strengthChangesByTemporalGroup(profile);
    },
    [scene, selectedTag, visible],
  );
  const selectedAtomicRelations = selectedStation
    ? visible.explicitRelations.filter(
        (relation) =>
          selectedStation.entry.workIds.includes(relation.sourceId) ||
          selectedStation.entry.workIds.includes(relation.targetId),
      )
    : [];
  const selectedRelationSharedTags = useMemo(() => {
    if (!selectedRelation) return [];
    const targetIds = new Set(selectedRelation.target.visibleTagIds);
    const sourceStrengths = new Map(
      (visible.aggregateMembershipsByStationId.get(selectedRelation.source.id) ?? [])
        .map((membership) => [membership.tagId, membership.strength]),
    );
    const targetStrengths = new Map(
      (visible.aggregateMembershipsByStationId.get(selectedRelation.target.id) ?? [])
        .map((membership) => [membership.tagId, membership.strength]),
    );
    return strongestTagSummaries(
      selectedRelation.source.visibleTagIds
        .filter((tagId) => targetIds.has(tagId))
        .map((tagId) => {
          const source = sourceStrengths.get(tagId);
          const target = targetStrengths.get(tagId);
          return {
            tagId,
            label: tagLabel(index, tagId),
            strength:
              source === null || source === undefined
                ? target ?? null
                : target === null || target === undefined
                  ? source
                  : Math.max(source, target),
          };
        }),
      Number.MAX_SAFE_INTEGER,
    );
  }, [index, selectedRelation, visible]);
  const selectedRelationSharedTagGroups = useMemo(
    () => groupUniqueTagLabels(selectedRelationSharedTags),
    [selectedRelationSharedTags],
  );
  const selectedRelationBundles = selectedRelation
    ? (baseTrajectoryProjection.groupsByRelationKey.get(selectedRelation.relation.key) ?? [])
        .filter((group) => group.kind === "bundle")
    : [];
  const provenanceGroups = useMemo(
    () => selectedStation ? groupStationProvenance(selectedStation.entry, visible) : [],
    [selectedStation, visible],
  );
  const selectedStationContextStateCount = useMemo(
    () => selectedStation
      ? connectedContextStateCountForStation(visible, selectedStation.id)
      : 0,
    [selectedStation, visible],
  );

  useEffect(() => {
    setRefinedWorkId(null);
  }, [selectedStation?.id]);

  useEffect(() => {
    if (!focusDetailsAfterUpdate.current) return;
    focusDetailsAfterUpdate.current = false;
    detailsPanelRef.current?.focus();
  }, [explicitExpandedTagIds, selection]);

  function addSeed(id: EntityId) {
    setExcludedTagIds((current) => current.filter((candidate) => candidate !== id));
    setSeedTagIds((current) => current.includes(id) ? current : [...current, id]);
  }

  function addExclusion(id: EntityId) {
    setSeedTagIds((current) => current.filter((candidate) => candidate !== id));
    setExcludedTagIds((current) => current.includes(id) ? current : [...current, id]);
    if (selection?.kind === "tag" && selection.id === id) {
      setSelection(null);
      setIsolatedTagId(null);
    }
  }

  function resetView() {
    setSeedTagIds(defaultSeedId ? [defaultSeedId] : []);
    setExcludedTagIds([]);
    setEarlierDepth(DEFAULT_EARLIER_DEPTH);
    setLaterDepth(DEFAULT_LATER_DEPTH);
    setExpansionMode(DEFAULT_EXPANSION_MODE);
    setIncludeYearOnly(DEFAULT_INCLUDE_YEAR_ONLY);
    setIncludeAmbiguous(DEFAULT_INCLUDE_AMBIGUOUS);
    setTasteFilter("all");
    setHideDislikedTags(false);
    setShowInferredPreference(true);
    setSelection(null);
    hoverController.current?.closeNow();
    setFocusTarget(null);
    setRefinedWorkId(null);
    setExplicitExpandedTagIds([]);
    setExpandedHierarchyParentIds([]);
    setPinnedTagIds([]);
    setIsolatedTagId(null);
    setVisibleTrajectoryLimit(DEFAULT_VISIBLE_TRAJECTORY_LIMIT);
    setZoom(1);
    setInspectorOpen(true);
  }

  function clearTags() {
    setSeedTagIds([]);
    setExcludedTagIds([]);
    setSelection(null);
    hoverController.current?.closeNow();
    setFocusTarget(null);
    setExplicitExpandedTagIds([]);
    setExpandedHierarchyParentIds([]);
    setPinnedTagIds([]);
    setIsolatedTagId(null);
  }

  function useMyTaste() {
    const preferred = deterministicTasteSeedTags(
      domain,
      ratings,
      inferredConceptTaste,
      6,
    ).filter((id) => index.tagById.has(id));
    if (!preferred.length) return;
    setExcludedTagIds((current) =>
      current.filter((id) => !preferred.includes(id)),
    );
    setSeedTagIds(preferred);
    // Inferred-positive seeds may be explicitly unrated, so the explicit
    // rating filter must not immediately hide the deterministic seed set.
    setTasteFilter("all");
  }

  function selectTarget(target: EvolutionInteractionTarget) {
    setIsolatedTagId((current) => nextIsolatedTagId(
      current,
      target,
      new Set(baseTrajectoryProjection.bundles.map((bundle) => bundle.id)),
    ));
    setSelection(target);
    setFocusTarget(target);
    setInspectorOpen(true);
  }

  function selectDetailsTarget(target: EvolutionInteractionTarget) {
    focusDetailsAfterUpdate.current = true;
    selectTarget(target);
  }

  function clearDetailsTarget() {
    focusDetailsAfterUpdate.current = true;
    setIsolatedTagId(null);
    setSelection(null);
  }

  function previewTarget(
    target: EvolutionInteractionTarget,
    node: SVGGElement,
    immediate = false,
  ) {
    setTooltipPosition(tooltipPositionFor(node));
    if (immediate) hoverController.current?.openNow(target);
    else hoverController.current?.pointerEnter(target);
  }

  function stopPreview(target: EvolutionInteractionTarget) {
    hoverController.current?.pointerLeave(target);
  }

  function keepPreviewOpen() {
    hoverController.current?.keepOpen();
  }

  function closePreview() {
    hoverController.current?.closeNow();
  }

  function interactionClasses(
    kind: EvolutionInteractionTarget["kind"],
    id: string,
  ): string[] {
    const base = evolutionItemInteractionClasses({
      kind,
      id,
      selection,
      hover,
      selectionLayer: presentation.selection,
      hoverLayer: presentation.hover,
      selectionLookup: selectionInteractionLookup,
      hoverLookup: hoverInteractionLookup,
    });
    const refined =
      kind === "relation" &&
      refinedWorkId &&
      scene.explicitRelations
        .find((relation) => relation.key === id)
        ?.relation.relations.some(
          (relation) =>
            relation.sourceId === refinedWorkId || relation.targetId === refinedWorkId,
        );
    return [
      ...base,
      refined ? "refined" : "",
    ].filter(Boolean);
  }

  const bucketEmphasis = (bucketId: string): "selected" | "preview" | null => {
    if (presentation.selection?.temporalBucket?.id === bucketId) return "selected";
    if (presentation.hover?.temporalBucket?.id === bucketId) return "preview";
    return null;
  };
  const sceneSummary = `${visible.tags.length.toLocaleString()} visible of ${trajectorySelection.eligibleCount.toLocaleString()} eligible trajectories · ${baseTrajectoryProjection.groups.length.toLocaleString()} rendered routes (${baseTrajectoryProjection.bundles.length.toLocaleString()} bundles) · ${scene.stations.length.toLocaleString()} aggregate stops · ${visible.works.length.toLocaleString()} works · ${scene.explicitRelations.length.toLocaleString()} explicit relation paths`;
  const statusWarnings = [
    visible.emptySeedTagIds.length
      ? `${visible.emptySeedTagIds.length} ${visible.emptySeedTagIds.length === 1 ? "seed has" : "seeds have"} no accepted dates`
      : null,
    visible.safetyStatus.warning,
  ].filter((warning): warning is string => Boolean(warning)).join(" · ");
  const legendTrajectories = visible.tags.map((entry) => ({
    id: entry.tag.id,
    label: entry.tag.label,
    color: scene.trajectoryById.get(entry.tag.id)?.color ?? "#aeb9bb",
    count: entry.stationIds.length,
    seed: entry.seed,
    selected: presentation.selection?.tagIds.includes(entry.tag.id) ?? false,
  }));
  const inspectorIdentity = selectedTag?.tag.id
    ?? selectedBundle?.id
    ?? selectedStation?.entry.hierarchyParentId
    ?? (selectedStation?.entry.workIds.length === 1
      ? selectedStation.entry.workIds[0]
      : selectedStation?.id)
    ?? selectedRelation?.key
    ?? "selection";

  return (
    <section
      className="metro-view"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setIsolatedTagId(null);
          setSelection(null);
          hoverController.current?.closeNow();
        }
      }}
    >
      <span className="sr-status" aria-live="polite">{sceneSummary}</span>

      <div className={`metro-workspace${inspectorOpen ? "" : " inspector-collapsed"}`}>
        <div className="evolution-workspace-main">
          <EvolutionControls
            status={(
              <EvolutionSceneStatus
                trajectoryCount={visible.tags.length}
                stationCount={scene.stations.length}
                interchangeCount={scene.stations.filter((station) => station.interchange).length}
                aggregateCount={scene.stations.filter((station) => station.aggregate).length}
                context={`${expansionMode === "directional" ? "Directional" : "Connected"} context · Earlier ${earlierDepth} · Later ${laterDepth}`}
                warnings={statusWarnings || undefined}
              />
            )}
            options={index.tagOptions}
            seedTagIds={seedTagIds}
            excludedTagIds={excludedTagIds}
            earlierDepth={earlierDepth}
            laterDepth={laterDepth}
            expansionMode={expansionMode}
            includeYearOnly={includeYearOnly}
            includeAmbiguous={includeAmbiguous}
            tasteFilter={tasteFilter}
            hideDislikedTags={hideDislikedTags}
            showInferredPreference={showInferredPreference}
            canUseTaste={index.tagOptions.some(
              (tag) =>
                ratings[tag.id] === 1 ||
                (inferredByConceptId.get(tag.id)?.score ?? 0) > 0,
            )}
            visibleTrajectoryLimit={visibleTrajectoryLimit}
            visibleTrajectoryCount={trajectorySelection.visibleCount}
            eligibleTrajectoryCount={trajectorySelection.eligibleCount}
            hiddenTrajectoryCount={trajectorySelection.hiddenCount}
            protectedBeyondLimitCount={trajectorySelection.protectedBeyondLimitCount}
            zoom={zoom}
            onAddSeed={addSeed}
            onRemoveSeed={(id) => setSeedTagIds((current) =>
              current.filter((item) => item !== id)
            )}
            onAddExclusion={addExclusion}
            onRemoveExclusion={(id) => setExcludedTagIds((current) =>
              current.filter((item) => item !== id)
            )}
            onEarlierDepthChange={setEarlierDepth}
            onLaterDepthChange={setLaterDepth}
            onExpansionModeChange={setExpansionMode}
            onIncludeYearOnlyChange={setIncludeYearOnly}
            onIncludeAmbiguousChange={setIncludeAmbiguous}
            onTasteFilterChange={setTasteFilter}
            onHideDislikedTagsChange={setHideDislikedTags}
            onShowInferredPreferenceChange={setShowInferredPreference}
            onUseTaste={useMyTaste}
            onVisibleTrajectoryLimitChange={setVisibleTrajectoryLimit}
            onClearTags={clearTags}
            onResetView={resetView}
            onZoomChange={setZoom}
          />
          <EvolutionCanvas
            scene={scene}
            visible={visible}
            index={index}
            renderTrajectoryGroups={renderTrajectoryGroups}
            hasSeedTags={Boolean(seedTagIds.length)}
            zoom={zoom}
            titleId={titleId}
            descriptionId={descriptionId}
            detailsId={detailsId}
            tooltipId={tooltipId}
            selection={selection}
            hover={hover}
            rovingFocusTarget={rovingFocusTarget}
            selectedTemporalBucketId={presentation.selection?.temporalBucket?.id ?? null}
            bucketEmphasis={bucketEmphasis}
            interactionClasses={interactionClasses}
            onClearSelection={() => {
              setSelection(null);
              setIsolatedTagId(null);
            }}
            onPreviewTarget={previewTarget}
            onStopPreview={stopPreview}
            onFocusTarget={setFocusTarget}
            onSelectTarget={selectTarget}
            onOpen={onOpen}
          />
          <EvolutionLegend
            trajectories={legendTrajectories}
            hiddenCount={trajectorySelection.hiddenCount}
          />
        </div>

        <EvolutionInspector
          detailsPanelRef={detailsPanelRef}
          detailsId={detailsId}
          inspectorOpen={inspectorOpen}
          inspectorIdentity={inspectorIdentity}
          selectedTarget={selectedTarget}
          selectedTag={selectedTag}
          selectedInferredPreference={selectedInferredPreference}
          selectedBundle={selectedBundle}
          selectedBundleRouteStationIds={selectedBundleRouteStationIds}
          selectedBundleTagGroups={selectedBundleTagGroups}
          selectedStation={selectedStation}
          selectedHierarchyParent={selectedHierarchyParent}
          selectedExpandedHierarchyParentId={selectedExpandedHierarchyParentId}
          selectedRelation={selectedRelation}
          selectedAggregateMemberships={selectedAggregateMemberships}
          selectedStationBundles={selectedStationBundles}
          selectedVisibleTagGroups={selectedVisibleTagGroups}
          selectedUnderlyingAssignments={selectedUnderlyingAssignments}
          selectedTagStrengthProfile={selectedTagStrengthProfile}
          selectedAtomicRelations={selectedAtomicRelations}
          selectedRelationSharedTags={selectedRelationSharedTags}
          selectedRelationSharedTagGroups={selectedRelationSharedTagGroups}
          selectedRelationBundles={selectedRelationBundles}
          provenanceGroups={provenanceGroups}
          selectedStationContextStateCount={selectedStationContextStateCount}
          index={index}
          visible={visible}
          scene={scene}
          ratings={ratings}
          onRate={onRate}
          onOpen={onOpen}
          showInferredPreference={showInferredPreference}
          expansionMode={expansionMode}
          pinnedTagIds={pinnedTagIds}
          refinedWorkId={refinedWorkId}
          seedTagIds={seedTagIds}
          excludedTagIds={excludedTagIds}
          earlierDepth={earlierDepth}
          laterDepth={laterDepth}
          onInspectorOpenChange={setInspectorOpen}
          onClearDetailsTarget={clearDetailsTarget}
          onSelectDetailsTarget={selectDetailsTarget}
          onAddSeed={addSeed}
          onTogglePinnedTag={(tagId) => setPinnedTagIds((current) =>
            current.includes(tagId)
              ? current.filter((candidate) => candidate !== tagId)
              : [...current, tagId].sort()
          )}
          onExcludeTag={(tagId) => {
            focusDetailsAfterUpdate.current = true;
            addExclusion(tagId);
          }}
          onExpandBundledTags={(tagIds) => {
            setExplicitExpandedTagIds((current) => [
              ...new Set([...current, ...tagIds]),
            ].sort());
            focusDetailsAfterUpdate.current = true;
            setIsolatedTagId(null);
            setSelection(null);
          }}
          onRefineWork={(workId) => setRefinedWorkId((current) =>
            current === workId ? null : workId
          )}
          onExpandHierarchy={(parentId) => {
            setExpandedHierarchyParentIds((current) => [
              ...new Set([...current, parentId]),
            ].sort());
            setSelection(null);
            setRefinedWorkId(null);
          }}
          onCollapseHierarchy={(parentId) => {
            setExpandedHierarchyParentIds((current) =>
              current.filter((candidate) => candidate !== parentId)
            );
            setSelection(null);
            setRefinedWorkId(null);
          }}
        />
      </div>
      {tooltip ? (
        <Tooltip
          id={tooltipId}
          tooltip={tooltip}
          position={tooltipPosition}
          onPointerEnter={keepPreviewOpen}
          onPointerLeave={closePreview}
        />
      ) : null}
    </section>
  );
}
