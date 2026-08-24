import type { RefObject } from "react";
import { EntityRatingButtons } from "./common";
import type { OpenHandler, RateHandler } from "./common";
import {
  aggregateStationRepresentedWorkCount,
  aggregateStationRepresentedWorkIds,
} from "../lib/evolution";
import type {
  AggregateMembership,
  AggregateStation,
  EvolutionIndex,
  ExpansionMode,
  ReachReason,
  VisibleEvolution,
  VisibleEvolutionTag,
  VisibleExplicitRelation,
} from "../lib/evolution";
import type { EvolutionInteractionTarget } from "../lib/evolution-interaction";
import { tagStrengthBand } from "../lib/evolution-strength";
import type { WeightedTagMembership } from "../lib/evolution-strength";
import { centralityScaleLabel, humanize } from "../lib/format";
import type { InferredConceptTaste } from "../lib/taste";
import {
  BUNDLE_EQUIVALENCE_REASON,
} from "../lib/trajectory-bundles";
import type {
  StrongestTagSummary,
  TagTrajectoryBundle,
  TagTrajectoryGroup,
  UniqueTagLabelGroup,
} from "../lib/trajectory-bundles";
import type { MetroExplicitRelation, MetroScene, MetroStation } from "../lib/timenets";
import type { EntityId, Ratings, Work } from "../lib/types";

export interface EvolutionInspectorStrengthEntry {
  stationId: string;
  label: string;
  strength: number | null;
  rawStrengths: readonly number[];
  change: number | null;
  first: boolean;
}

export interface EvolutionInspectorProvenanceGroup {
  key: string;
  reason: ReachReason;
  workIds: EntityId[];
  entries: Array<{ workId: EntityId; reason: ReachReason }>;
  occurrences: number;
}

export interface EvolutionInspectorProps {
  detailsPanelRef: RefObject<HTMLElement | null>;
  detailsId: string;
  inspectorOpen: boolean;
  inspectorIdentity: string;
  selectedTarget: EvolutionInteractionTarget | null;
  selectedTag: VisibleEvolutionTag | null;
  selectedInferredPreference: InferredConceptTaste | null;
  selectedBundle: TagTrajectoryBundle | null;
  selectedBundleRouteStationIds: readonly string[];
  selectedBundleTagGroups: readonly UniqueTagLabelGroup[];
  selectedStation: MetroStation | null;
  selectedHierarchyParent: Work | null;
  selectedExpandedHierarchyParentId: EntityId | null;
  selectedRelation: MetroExplicitRelation | null;
  selectedAggregateMemberships: readonly AggregateMembership[];
  selectedStationBundles: readonly TagTrajectoryGroup[];
  selectedVisibleTagGroups: readonly UniqueTagLabelGroup[];
  selectedUnderlyingAssignments: readonly (WeightedTagMembership & { label: string })[];
  selectedTagStrengthProfile: readonly EvolutionInspectorStrengthEntry[];
  selectedAtomicRelations: readonly VisibleExplicitRelation[];
  selectedRelationSharedTags: readonly StrongestTagSummary[];
  selectedRelationSharedTagGroups: readonly UniqueTagLabelGroup[];
  selectedRelationBundles: readonly TagTrajectoryGroup[];
  provenanceGroups: readonly EvolutionInspectorProvenanceGroup[];
  selectedStationContextStateCount: number;
  index: EvolutionIndex;
  visible: VisibleEvolution;
  scene: MetroScene;
  ratings: Ratings;
  onRate: RateHandler;
  onOpen: OpenHandler;
  showInferredPreference: boolean;
  expansionMode: ExpansionMode;
  pinnedTagIds: readonly EntityId[];
  refinedWorkId: EntityId | null;
  seedTagIds: readonly EntityId[];
  excludedTagIds: readonly EntityId[];
  earlierDepth: number;
  laterDepth: number;
  onInspectorOpenChange: (open: boolean) => void;
  onClearDetailsTarget: () => void;
  onSelectDetailsTarget: (target: EvolutionInteractionTarget) => void;
  onAddSeed: (tagId: EntityId) => void;
  onTogglePinnedTag: (tagId: EntityId) => void;
  onExcludeTag: (tagId: EntityId) => void;
  onExpandBundledTags: (tagIds: readonly EntityId[]) => void;
  onRefineWork: (workId: EntityId) => void;
  onExpandHierarchy: (parentId: EntityId) => void;
  onCollapseHierarchy: (parentId: EntityId) => void;
}

interface SharedSectionProps {
  index: EvolutionIndex;
  visible: VisibleEvolution;
  scene: MetroScene;
  onSelectDetailsTarget: (target: EvolutionInteractionTarget) => void;
  onClearDetailsTarget: () => void;
}

function tagLabel(index: EvolutionIndex, id: EntityId): string {
  return index.tagById.get(id)?.label ?? id;
}

function workLabel(index: EvolutionIndex, id: EntityId): string {
  return index.domain.workById.get(id)?.label ?? id;
}

function aggregateCountLabel(station: AggregateStation): string {
  const count = aggregateStationRepresentedWorkCount(station);
  const noun = station.membershipType === "track_of"
    ? "track"
    : station.membershipType === "episode_of"
      ? "episode"
      : station.membershipType === "season_of"
        ? "season"
        : station.membershipType === "chapter_of"
          ? "chapter"
          : station.membershipType === "volume_of"
            ? "volume"
            : station.membershipType === "issue_of"
              ? "issue"
              : station.membershipType === "part_of"
                ? "part"
                : "work";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function dateQualityLabel(station: MetroStation): string {
  const temporal = station.entry.temporal;
  if (temporal.quality === "ambiguous") return "Ambiguous date";
  if (temporal.quality === "year-only") return "Year-only date";
  return temporal.precision === "month" ? "Month-level date" : "Exact date";
}

function strengthValueLabel(strength: number | null): string {
  return strength === null ? "unknown strength" : `${Math.round(strength * 100)}% normalized`;
}

function strengthChangeLabel(change: number | null, first: boolean): string {
  if (first) return "route start";
  if (change === null) return "change unknown";
  const points = Math.round(change * 100);
  if (points === 0) return "no change";
  return `${points > 0 ? "+" : ""}${points} percentage points`;
}

function rawStrengthValuesLabel(values: readonly number[]): string {
  return values.length ? `raw source ${values.join(", ")}` : "raw source unknown";
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

function normalizedStrengthRangeLabel(
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

function reasonField(reason: ReachReason, name: string): string | null {
  const value = (reason as unknown as Record<string, unknown>)[name];
  return typeof value === "string" && value ? value : null;
}

function reachReasonLabel(reason: ReachReason, index: EvolutionIndex): string {
  const seedId = reasonField(reason, "seedTagId");
  const seed = seedId ? tagLabel(index, seedId) : "a seed trajectory";
  const tagId = reasonField(reason, "viaTagId") ?? reasonField(reason, "tagId");
  const direction = reasonField(reason, "direction");
  const sourceStation = reasonField(reason, "fromStationId")
    ?? reasonField(reason, "sourceStationId")
    ?? reasonField(reason, "stopId");
  const sourceWork = reasonField(reason, "fromWorkId");
  const context = "context" in reason ? reason.context : undefined;
  const connectedSuffix = context
    ? ` Connected path used ${context.earlierUsed} earlier and ${context.laterUsed} later steps${context.path.length ? ` (${context.path.map((step) => step.direction).join(" → ")})` : ""}.`
    : "";
  switch (reason.kind) {
    case "seed-tag":
      return `${seed} is a selected seed trajectory.`;
    case "seed-membership":
      return `Seed ${seed} directly includes this ${tagId ? `membership on ${tagLabel(index, tagId)}` : "stop"}.`;
    case "shared-work":
      return `Seed ${seed} reached ${tagId ? tagLabel(index, tagId) : "this tag"} through ${sourceWork ? workLabel(index, sourceWork) : "a shared stop"}.${connectedSuffix}`;
    case "temporal-neighbor":
      return `From seed ${seed}: nearest ${direction ?? "directional"} stop on ${tagId ? tagLabel(index, tagId) : "the traversed tag"}${sourceWork ? ` from ${workLabel(index, sourceWork)}` : sourceStation ? ` from stop ${sourceStation}` : ""}.${connectedSuffix}`;
    case "visible-interchange":
      return `Seed ${seed} reaches ${tagId ? tagLabel(index, tagId) : "another visible tag"} at this interchange.${connectedSuffix}`;
    default:
      return `${humanize(String((reason as { kind: string }).kind))} from ${seed}.`;
  }
}

function reachReasonPathLabels(
  reason: ReachReason,
  index: EvolutionIndex,
  scene: MetroScene,
): string[] {
  if (!("context" in reason) || !reason.context?.path.length) return [];
  let earlierUsed = 0;
  let laterUsed = 0;
  const stationLabel = (stationId: string | undefined, temporalGroupId: string) => {
    if (!stationId) return temporalGroupId;
    const station = scene.stationById.get(stationId);
    if (!station) return `${stationId} (${temporalGroupId})`;
    const contents = aggregateStationRepresentedWorkCount(station.entry) === 1
      ? workLabel(index, station.entry.workIds[0]!)
      : aggregateCountLabel(station.entry);
    return `${station.entry.temporal.displayLabel} · ${contents} [${stationId}]`;
  };
  return reason.context.path.map((step, position) => {
    if (step.direction === "earlier") earlierUsed += 1;
    else laterUsed += 1;
    return `${position + 1}. ${tagLabel(index, step.tagId)} [${step.tagId}] · ${step.direction}: ${stationLabel(step.sourceStationId, step.sourceTemporalGroupId)} → ${stationLabel(step.targetStationId, step.targetTemporalGroupId)} · budgets Earlier ${earlierUsed}, Later ${laterUsed}`;
  });
}

function reachSummary(reach: {
  depth: number;
  seedDepth: number | null;
  earlierDepth: number | null;
  laterDepth: number | null;
}): string {
  if (reach.seedDepth === 0) return "Seed trajectory · depth 0";
  const parts: string[] = [];
  if (reach.earlierDepth !== null) parts.push(`earlier ${reach.earlierDepth}`);
  if (reach.laterDepth !== null) parts.push(`later ${reach.laterDepth}`);
  return parts.length ? parts.join(" · ") : "Visible context";
}

function TagInspectorSection({
  selectedTag,
  selectedInferredPreference,
  selectedTagStrengthProfile,
  ratings,
  onRate,
  showInferredPreference,
  expansionMode,
  pinnedTagIds,
  index,
  scene,
  onSelectDetailsTarget,
  onClearDetailsTarget,
  onAddSeed,
  onTogglePinnedTag,
  onExcludeTag,
}: SharedSectionProps & {
  selectedTag: VisibleEvolutionTag;
  selectedInferredPreference: InferredConceptTaste | null;
  selectedTagStrengthProfile: readonly EvolutionInspectorStrengthEntry[];
  ratings: Ratings;
  onRate: RateHandler;
  showInferredPreference: boolean;
  expansionMode: ExpansionMode;
  pinnedTagIds: readonly EntityId[];
  onAddSeed: (tagId: EntityId) => void;
  onTogglePinnedTag: (tagId: EntityId) => void;
  onExcludeTag: (tagId: EntityId) => void;
}) {
  return (
    <>
      <span className="metro-details-kicker">Tag trajectory</span>
      <h3>{selectedTag.tag.label}</h3>
      <p>{humanize(selectedTag.tag.conceptType)} · {reachSummary(selectedTag)}</p>
      <div className="metro-tag-rating">
        <span>
          Your rating: {ratings[selectedTag.tag.id] === 1
            ? "+"
            : ratings[selectedTag.tag.id] === -1
              ? "−"
              : "Unrated"}
        </span>
        <EntityRatingButtons
          id={selectedTag.tag.id}
          label={selectedTag.tag.label}
          ratings={ratings}
          onRate={onRate}
        />
      </div>
      {showInferredPreference && selectedInferredPreference ? (
        <div className="metro-inferred-preference">
          <strong>
            Inferred preference: {selectedInferredPreference.score >= 0 ? "+" : ""}
            {selectedInferredPreference.score.toFixed(2)}
          </strong>
          <span>
            Derived from {selectedInferredPreference.evidence.length} rated work/agent
            {selectedInferredPreference.evidence.length === 1 ? "" : "s"}; it does not change your explicit rating.
          </span>
          <ul>
            {selectedInferredPreference.evidence.slice(0, 3).map((evidence) => (
              <li key={`${evidence.family}:${evidence.entityId}`}>
                {evidence.rating === 1 ? "+" : "−"} {evidence.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <dl>
        <div><dt>Aggregate stops</dt><dd>{selectedTag.stationIds.length}</dd></div>
        <div><dt>Contained works</dt><dd>{selectedTag.workIds.length}</dd></div>
        <div><dt>First / last</dt><dd>{selectedTag.firstTemporal.displayLabel} → {selectedTag.lastTemporal.displayLabel}</dd></div>
        <div><dt>Origin targets</dt><dd>{selectedTag.origin.targetStationIds.length}</dd></div>
      </dl>
      <h4>Strength by visible stop</h4>
      <ul className="metro-strength-profile">
        {selectedTagStrengthProfile.map((entry) => (
          <li key={entry.stationId}>
            <button type="button" onClick={() => onSelectDetailsTarget({ kind: "station", id: entry.stationId })}>
              <span>{entry.label}</span>
              <small>
                {tagStrengthBand(entry.strength)} · {strengthValueLabel(entry.strength)} · {rawStrengthValuesLabel(entry.rawStrengths)} · {strengthChangeLabel(entry.change, entry.first)}
              </small>
            </button>
          </li>
        ))}
      </ul>
      <h4>{expansionMode === "connected" ? "Connected-context provenance" : "Directional provenance"}</h4>
      <ul>
        {selectedTag.reasons.map((reason) => (
          <li key={reasonKey(reason)}>
            <span>{reachReasonLabel(reason, index)}</span>
            {reachReasonPathLabels(reason, index, scene).length ? (
              <ol className="metro-provenance-path">
                {reachReasonPathLabels(reason, index, scene).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="metro-details-actions">
        {!selectedTag.seed ? <button type="button" onClick={() => onAddSeed(selectedTag.tag.id)}>Add as seed</button> : null}
        <button type="button" onClick={() => onTogglePinnedTag(selectedTag.tag.id)}>
          {pinnedTagIds.includes(selectedTag.tag.id) ? "Unpin trajectory" : "Pin trajectory"}
        </button>
        <button type="button" onClick={() => onExcludeTag(selectedTag.tag.id)}>Exclude tag</button>
        <button type="button" onClick={onClearDetailsTarget}>Clear focus</button>
      </div>
    </>
  );
}

function BundleInspectorSection({
  selectedBundle,
  selectedBundleRouteStationIds,
  selectedBundleTagGroups,
  index,
  visible,
  scene,
  onSelectDetailsTarget,
  onClearDetailsTarget,
  onExpandBundledTags,
}: SharedSectionProps & {
  selectedBundle: TagTrajectoryBundle;
  selectedBundleRouteStationIds: readonly string[];
  selectedBundleTagGroups: readonly UniqueTagLabelGroup[];
  onExpandBundledTags: (tagIds: readonly EntityId[]) => void;
}) {
  return (
    <>
      <span className="metro-details-kicker">Trajectory bundle</span>
      <h3>{selectedBundle.tagIds.length} equivalent tags</h3>
      <p>{BUNDLE_EQUIVALENCE_REASON}.</p>
      <dl>
        <div><dt>Unique tags</dt><dd>{selectedBundle.tagIds.length}</dd></div>
        <div><dt>Shared stops</dt><dd>{selectedBundle.stationIds.length}</dd></div>
        <div><dt>Segments</dt><dd>{selectedBundle.segments.length}</dd></div>
        <div><dt>Bundle state</dt><dd>Collapsed</dd></div>
      </dl>
      <h4>Unique bundled tags</h4>
      <div className="metro-unique-tag-list">
        {selectedBundleTagGroups.map((group) => (
          <details key={group.normalizedLabel} open={group.conceptRecordCount === 1}>
            <summary>
              <span>{group.label}</span>
              <small>
                {group.conceptRecordCount > 1 ? `${group.conceptRecordCount} concept records · ` : ""}
                strongest {strengthValueLabel(group.strongestStrength)}
              </small>
            </summary>
            <div>
              {group.tagIds.map((tagId) => {
                const entry = selectedBundle.entries.find((candidate) => candidate.tagId === tagId)!;
                return (
                  <button type="button" key={tagId} onClick={() => onSelectDetailsTarget({ kind: "tag", id: tagId })}>
                    <span>Isolate {tagLabel(index, tagId)}</span>
                    <small>
                      {tagId} · normalized {entry.strengthProfile.map(strengthValueLabel).join(" → ")} · {entry.stationIds.map((stationId) => rawStrengthValuesLabel(rawMembershipStrengths(visible, tagId, stationId))).join(" → ")} · {BUNDLE_EQUIVALENCE_REASON}
                    </small>
                  </button>
                );
              })}
            </div>
          </details>
        ))}
      </div>
      <h4>Shared route</h4>
      <ol className="metro-bundle-route">
        {selectedBundleRouteStationIds.map((stationId) => (
          <li key={stationId}>
            <button type="button" onClick={() => onSelectDetailsTarget({ kind: "station", id: stationId })}>
              {scene.stationById.get(stationId)?.entry.temporal.displayLabel ?? stationId}
            </button>
          </li>
        ))}
      </ol>
      <div className="metro-details-actions">
        <button type="button" onClick={() => onExpandBundledTags(selectedBundle.tagIds)}>
          Expand bundled tags
        </button>
        <button type="button" onClick={onClearDetailsTarget}>Clear focus</button>
      </div>
    </>
  );
}

function StationInspectorSection({
  selectedStation,
  selectedHierarchyParent,
  selectedExpandedHierarchyParentId,
  selectedAggregateMemberships,
  selectedStationBundles,
  selectedVisibleTagGroups,
  selectedUnderlyingAssignments,
  selectedAtomicRelations,
  provenanceGroups,
  selectedStationContextStateCount,
  expansionMode,
  refinedWorkId,
  index,
  visible,
  scene,
  onOpen,
  onSelectDetailsTarget,
  onClearDetailsTarget,
  onRefineWork,
  onExpandHierarchy,
  onCollapseHierarchy,
}: SharedSectionProps & {
  selectedStation: MetroStation;
  selectedHierarchyParent: Work | null;
  selectedExpandedHierarchyParentId: EntityId | null;
  selectedAggregateMemberships: readonly AggregateMembership[];
  selectedStationBundles: readonly TagTrajectoryGroup[];
  selectedVisibleTagGroups: readonly UniqueTagLabelGroup[];
  selectedUnderlyingAssignments: readonly (WeightedTagMembership & { label: string })[];
  selectedAtomicRelations: readonly VisibleExplicitRelation[];
  provenanceGroups: readonly EvolutionInspectorProvenanceGroup[];
  selectedStationContextStateCount: number;
  expansionMode: ExpansionMode;
  refinedWorkId: EntityId | null;
  onOpen: OpenHandler;
  onRefineWork: (workId: EntityId) => void;
  onExpandHierarchy: (parentId: EntityId) => void;
  onCollapseHierarchy: (parentId: EntityId) => void;
}) {
  return (
    <>
      <span className="metro-details-kicker">{selectedStation.aggregate ? "Aggregate station" : "Work station"}</span>
      <h3>{selectedHierarchyParent?.label ?? (selectedStation.aggregate ? aggregateCountLabel(selectedStation.entry) : workLabel(index, selectedStation.entry.workIds[0]!))}</h3>
      <p>{selectedHierarchyParent ? `${aggregateCountLabel(selectedStation.entry)} · ` : ""}{selectedStation.entry.temporal.displayLabel} · {dateQualityLabel(selectedStation)} · {reachSummary(selectedStation.entry)}</p>
      {selectedStation.interchange ? (
        <div className="metro-continuity-callout">
          <strong>Continuity ≠ influence</strong>
          <p>
            These trajectories meet here through shared tag membership.
            Shared membership is not a claim of influence or causality.
          </p>
        </div>
      ) : null}
      {selectedStation.entry.temporal.precision !== "day" ? (
        <div className="metro-flexible-date-note">
          Known only to {selectedStation.entry.temporal.precision === "year"
            ? selectedStation.entry.temporal.year
            : selectedStation.entry.temporal.displayLabel.replace(/^≈\s*/, "")}.
          {" "}Position optimized within the {selectedStation.entry.temporal.precision} for readability.
        </div>
      ) : null}
      {selectedStation.entry.temporal.ambiguityReasons.length ? (
        <div className="metro-date-warning">{selectedStation.entry.temporal.ambiguityReasons.join("; ")}</div>
      ) : null}
      <dl>
        <div><dt>Earlier reach</dt><dd>{selectedStation.entry.earlierDepth ?? "—"}</dd></div>
        <div><dt>Later reach</dt><dd>{selectedStation.entry.laterDepth ?? "—"}</dd></div>
        <div><dt>Visible tags</dt><dd>{selectedStation.visibleTagIds.length}</dd></div>
        <div><dt>Placement role</dt><dd>{humanize(selectedStation.reachRole)}</dd></div>
        <div><dt>Context states</dt><dd>{expansionMode === "connected" ? selectedStationContextStateCount : "Directional mode"}</dd></div>
        <div><dt>Trajectory bundles</dt><dd>{selectedStationBundles.length}</dd></div>
        <div><dt>Explicit relations</dt><dd>{selectedAtomicRelations.length}</dd></div>
        {selectedHierarchyParent ? (
          <div><dt>Hierarchy</dt><dd>{humanize(selectedStation.entry.membershipType ?? "part_of")} · {selectedHierarchyParent.label}</dd></div>
        ) : null}
        {selectedStation.entry.surfacedOutlierWorkIds?.length ? (
          <div><dt>Focus exceptions</dt><dd>{selectedStation.entry.surfacedOutlierWorkIds.map((workId) => workLabel(index, workId)).join(", ")}</dd></div>
        ) : null}
      </dl>
      <h4>Contained works</h4>
      <div className="metro-contained-works">
        {aggregateStationRepresentedWorkIds(selectedStation.entry).map((workId) => {
          const visibleWork = visible.workById.get(workId) ?? null;
          const work = visibleWork?.work ?? index.domain.workById.get(workId)!;
          return (
            <div key={workId} className={refinedWorkId === workId ? "refined" : ""}>
              <button
                type="button"
                aria-pressed={refinedWorkId === workId}
                onClick={() => onRefineWork(workId)}
              >
                <span>{work.label}</span>
                <small>{humanize(work.medium)} · {visibleWork ? reachSummary(visibleWork) : "outside current reach"}</small>
              </button>
              <button type="button" onClick={() => onOpen(workId)}>Open record</button>
              {visibleWork?.temporal.ambiguityReasons.length ? <small>{visibleWork.temporal.ambiguityReasons.join("; ")}</small> : null}
            </div>
          );
        })}
      </div>
      <h4>Unique visible tags</h4>
      <div className="metro-unique-tag-list">
        {selectedVisibleTagGroups.map((group) => {
          const records = selectedAggregateMemberships.filter((membership) =>
            group.tagIds.includes(membership.tagId),
          );
          if (group.conceptRecordCount === 1) {
            const membership = records[0]!;
            const maximumProviders = membership.strengthSummary.maxWorkIds
              .map((workId) => workLabel(index, workId))
              .join(", ");
            return (
              <button type="button" key={group.normalizedLabel} onClick={() => onSelectDetailsTarget({ kind: "tag", id: membership.tagId })}>
                <span>{group.label}</span>
                <small>
                  {tagStrengthBand(membership.strength)} · {strengthValueLabel(membership.strength)} · {normalizedStrengthRangeLabel(
                    membership.strengthSummary.minStrength,
                    membership.strengthSummary.maxStrength,
                    membership.strengthSummary.medianStrength,
                  )} · {Math.round(membership.strengthSummary.coverage * 100)}% child coverage · mean {strengthValueLabel(membership.strengthSummary.meanStrength)} · {selectedHierarchyParent?.concepts.some((assignment) => assignment.id === membership.tagId) ? "also assigned directly to parent" : "derived from children"} · {maximumProviders ? `maximum from ${maximumProviders}` : "maximum source unknown"} · {reachSummary(membership)}
                </small>
              </button>
            );
          }
          return (
            <details key={group.normalizedLabel}>
              <summary>
                <span>{group.label}</span>
                <small>{group.conceptRecordCount} concept records · strongest {strengthValueLabel(group.strongestStrength)}</small>
              </summary>
              <div>
                {records.map((membership) => (
                  <button type="button" key={membership.key} onClick={() => onSelectDetailsTarget({ kind: "tag", id: membership.tagId })}>
                    <span>{membership.tagId}</span>
                    <small>
                      {tagStrengthBand(membership.strength)} · {strengthValueLabel(membership.strength)} · {normalizedStrengthRangeLabel(
                        membership.strengthSummary.minStrength,
                        membership.strengthSummary.maxStrength,
                        membership.strengthSummary.medianStrength,
                      )} · {membership.strengthSummary.maxWorkIds.length
                        ? `maximum from ${membership.strengthSummary.maxWorkIds.map((workId) => workLabel(index, workId)).join(", ")}`
                        : "maximum source unknown"}
                    </small>
                  </button>
                ))}
              </div>
            </details>
          );
        })}
      </div>
      <h4>Underlying assignments</h4>
      <ul className="metro-assignment-list">
        {selectedUnderlyingAssignments.map((assignment) => (
          <li
            key={`${assignment.tagId}:${assignment.workId}`}
            className={refinedWorkId === assignment.workId ? "refined" : ""}
          >
            <strong>{assignment.label}</strong> on {workLabel(index, assignment.workId)}
            <small>
              Raw {assignment.rawStrength ?? "unknown"} · {tagStrengthBand(assignment.strength)} · {strengthValueLabel(assignment.strength)}
              {` · ${centralityScaleLabel(assignment.centralityScale)}`}
              {assignment.historicalRole ? ` · ${humanize(assignment.historicalRole)}` : ""}
              {assignment.confidence !== null ? ` · confidence ${Math.round(assignment.confidence * 100)}%` : " · confidence unknown"}
            </small>
          </li>
        ))}
      </ul>
      {selectedStationBundles.length ? (
        <>
          <h4>Trajectory bundles</h4>
          <div className="metro-unique-tag-list">
            {selectedStationBundles.map((bundle) => (
              <button type="button" key={bundle.id} onClick={() => onSelectDetailsTarget({ kind: "bundle", id: bundle.id })}>
                <span>{bundle.tagIds.length} equivalent tags</span>
                <small>{bundle.tagIds.map((tagId) => tagLabel(index, tagId)).join(" · ")}</small>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <h4>Grouped {expansionMode === "connected" ? "connected-context" : "directional"} provenance</h4>
      <p className="metro-provenance-note">
        Equivalent seed, direction, source-stop, traversed-tag, and depth explanations are grouped across contained works.
      </p>
      <div className="metro-provenance-groups">
        {provenanceGroups.map((group) => (
          <details key={group.key} open={group.workIds.length <= 1}>
            <summary>{reachReasonLabel(group.reason, index)}{group.occurrences > 1 ? ` · ${group.occurrences} records` : ""}</summary>
            {reachReasonPathLabels(group.reason, index, scene).length ? (
              <ol className="metro-provenance-path">
                {reachReasonPathLabels(group.reason, index, scene).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            ) : null}
            {group.entries.length ? (
              <ul>
                {group.entries.map((entry) => (
                  <li key={`${entry.workId}:${reasonKey(entry.reason)}`}>
                    <strong>{workLabel(index, entry.workId)}</strong>
                    <span>{reachReasonLabel(entry.reason, index)}</span>
                    {reachReasonPathLabels(entry.reason, index, scene).length ? (
                      <ol className="metro-provenance-path">
                        {reachReasonPathLabels(entry.reason, index, scene).map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        ))}
      </div>
      {selectedAtomicRelations.length ? (
        <>
          <h4>Explicit relations</h4>
          <ul className="metro-relation-cards">
            {selectedAtomicRelations.map((relation) => (
              <li key={relation.key} className="metro-relation-card">
                <strong>{humanize(relation.relationType)}</strong>
                <span>{workLabel(index, relation.sourceId)} → {workLabel(index, relation.targetId)}</span>
                {relation.chronologyConflict ? <small>Chronology conflict</small> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="metro-details-actions">
        {selectedStation.entry.hierarchyParentId ? (
          <button type="button" onClick={() => onExpandHierarchy(selectedStation.entry.hierarchyParentId!)}>
            Show {aggregateCountLabel(selectedStation.entry).replace(/^\d+\s+/, "")}
          </button>
        ) : null}
        {selectedExpandedHierarchyParentId ? (
          <button type="button" onClick={() => onCollapseHierarchy(selectedExpandedHierarchyParentId)}>
            Collapse into {workLabel(index, selectedExpandedHierarchyParentId)}
          </button>
        ) : null}
        <button type="button" onClick={onClearDetailsTarget}>Clear focus</button>
      </div>
    </>
  );
}

function RelationInspectorSection({
  selectedRelation,
  selectedRelationSharedTags,
  selectedRelationSharedTagGroups,
  selectedRelationBundles,
  index,
  onSelectDetailsTarget,
  onClearDetailsTarget,
}: SharedSectionProps & {
  selectedRelation: MetroExplicitRelation;
  selectedRelationSharedTags: readonly StrongestTagSummary[];
  selectedRelationSharedTagGroups: readonly UniqueTagLabelGroup[];
  selectedRelationBundles: readonly TagTrajectoryGroup[];
}) {
  return (
    <>
      <span className="metro-details-kicker">Aggregate explicit relation</span>
      <h3>{selectedRelation.relation.relations.length} {selectedRelation.relation.relations.length === 1 ? "relation" : "relations"}</h3>
      <p>{selectedRelation.relation.relationTypes.map(humanize).join(" · ")}</p>
      <dl>
        <div><dt>Source stop</dt><dd>{aggregateCountLabel(selectedRelation.source.entry)}</dd></div>
        <div><dt>Target stop</dt><dd>{aggregateCountLabel(selectedRelation.target.entry)}</dd></div>
        <div><dt>Relation types</dt><dd>{selectedRelation.relation.relationTypes.length}</dd></div>
        <div><dt>Chronology conflicts</dt><dd>{selectedRelation.relation.relations.filter((relation) => relation.chronologyConflict).length}</dd></div>
        <div><dt>Shared unique tags</dt><dd>{selectedRelationSharedTags.length}</dd></div>
        <div><dt>Bundled routes</dt><dd>{selectedRelationBundles.length}</dd></div>
      </dl>
      <h4>Strongest shared tags</h4>
      {selectedRelationSharedTags.length ? (
        <ol className="metro-strength-profile">
          {selectedRelationSharedTags.slice(0, 3).map((tag) => (
            <li key={`strongest:${tag.tagId}`}>
              <button type="button" onClick={() => onSelectDetailsTarget({ kind: "tag", id: tag.tagId })}>
                <span>{tag.label}</span>
                <small>{tagStrengthBand(tag.strength)} · {strengthValueLabel(tag.strength)}</small>
              </button>
            </li>
          ))}
        </ol>
      ) : <p>No shared visible tags connect these stops.</p>}
      <h4>Complete shared unique tags</h4>
      {selectedRelationSharedTagGroups.length ? (
        <div className="metro-unique-tag-list">
          {selectedRelationSharedTagGroups.map((group) => {
            const records = selectedRelationSharedTags.filter((tag) =>
              group.tagIds.includes(tag.tagId),
            );
            if (group.conceptRecordCount === 1) {
              const tag = records[0]!;
              return (
                <button type="button" key={group.normalizedLabel} onClick={() => onSelectDetailsTarget({ kind: "tag", id: tag.tagId })}>
                  <span>{group.label}</span>
                  <small>{tagStrengthBand(tag.strength)} · {strengthValueLabel(tag.strength)}</small>
                </button>
              );
            }
            return (
              <details key={group.normalizedLabel}>
                <summary>
                  <span>{group.label}</span>
                  <small>{group.conceptRecordCount} concept records · strongest {strengthValueLabel(group.strongestStrength)}</small>
                </summary>
                <div>
                  {records.map((tag) => (
                    <button type="button" key={tag.tagId} onClick={() => onSelectDetailsTarget({ kind: "tag", id: tag.tagId })}>
                      <span>{tag.tagId}</span>
                      <small>{tagStrengthBand(tag.strength)} · {strengthValueLabel(tag.strength)}</small>
                    </button>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      ) : <p>No shared visible tags connect these stops.</p>}
      {selectedRelationBundles.length ? (
        <>
          <h4>Bundled shared tags</h4>
          <div className="metro-unique-tag-list">
            {selectedRelationBundles.map((bundle) => (
              <button type="button" key={bundle.id} onClick={() => onSelectDetailsTarget({ kind: "bundle", id: bundle.id })}>
                <span>{bundle.tagIds.length} bundled tags</span>
                <small>{bundle.tagIds.map((tagId) => tagLabel(index, tagId)).join(" · ")}</small>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <h4>Underlying work relations</h4>
      <ul>
        {selectedRelation.relation.relations.map((relation) => (
          <li key={relation.key}>
            {workLabel(index, relation.sourceId)} → {workLabel(index, relation.targetId)} · {humanize(relation.relationType)}
            {relation.chronologyConflict ? " · chronology conflict" : ""}
          </li>
        ))}
      </ul>
      <div className="metro-details-actions">
        <button type="button" onClick={() => onSelectDetailsTarget({ kind: "station", id: selectedRelation.source.id })}>Focus source stop</button>
        <button type="button" onClick={() => onSelectDetailsTarget({ kind: "station", id: selectedRelation.target.id })}>Focus target stop</button>
        <button type="button" onClick={onClearDetailsTarget}>Clear focus</button>
      </div>
    </>
  );
}

function EmptyInspectorSection({
  seedTagIds,
  excludedTagIds,
  earlierDepth,
  laterDepth,
  expansionMode,
}: {
  seedTagIds: readonly EntityId[];
  excludedTagIds: readonly EntityId[];
  earlierDepth: number;
  laterDepth: number;
  expansionMode: ExpansionMode;
}) {
  return (
    <>
      <span className="metro-details-kicker">How to read the map</span>
      <h3>Historical tag continuity</h3>
      <p>
        Hover previews only the item under the pointer. Click a trajectory,
        bundle, station, or explicit relation for persistent focus, path
        provenance, strength details, and complete underlying records.
      </p>
      <dl>
        <div><dt>Seeds</dt><dd>{seedTagIds.length}</dd></div>
        <div><dt>Excluded</dt><dd>{excludedTagIds.length}</dd></div>
        <div><dt>Earlier depth</dt><dd>{earlierDepth}</dd></div>
        <div><dt>Later depth</dt><dd>{laterDepth}</dd></div>
        <div><dt>Expansion mode</dt><dd>{expansionMode === "directional" ? "Directional" : "Connected context"}</dd></div>
      </dl>
    </>
  );
}

export function EvolutionInspector(props: EvolutionInspectorProps) {
  const {
    detailsPanelRef,
    detailsId,
    inspectorOpen,
    inspectorIdentity,
    selectedTarget,
    selectedTag,
    selectedInferredPreference,
    selectedBundle,
    selectedBundleRouteStationIds,
    selectedBundleTagGroups,
    selectedStation,
    selectedHierarchyParent,
    selectedExpandedHierarchyParentId,
    selectedRelation,
    selectedAggregateMemberships,
    selectedStationBundles,
    selectedVisibleTagGroups,
    selectedUnderlyingAssignments,
    selectedTagStrengthProfile,
    selectedAtomicRelations,
    selectedRelationSharedTags,
    selectedRelationSharedTagGroups,
    selectedRelationBundles,
    provenanceGroups,
    selectedStationContextStateCount,
    index,
    visible,
    scene,
    ratings,
    onRate,
    onOpen,
    showInferredPreference,
    expansionMode,
    pinnedTagIds,
    refinedWorkId,
    seedTagIds,
    excludedTagIds,
    earlierDepth,
    laterDepth,
    onInspectorOpenChange,
    onClearDetailsTarget,
    onSelectDetailsTarget,
    onAddSeed,
    onTogglePinnedTag,
    onExcludeTag,
    onExpandBundledTags,
    onRefineWork,
    onExpandHierarchy,
    onCollapseHierarchy,
  } = props;

  const shared = {
    index,
    visible,
    scene,
    onSelectDetailsTarget,
    onClearDetailsTarget,
  };

  return (
    <>
      {!inspectorOpen ? (
        <button
          type="button"
          className="metro-inspector-restore"
          aria-controls={detailsId}
          aria-expanded="false"
          onClick={() => onInspectorOpenChange(true)}
        >
          Show inspector
        </button>
      ) : null}

      <aside
        ref={detailsPanelRef}
        id={detailsId}
        className="metro-details"
        data-details-kind={selectedTarget?.kind ?? "none"}
        aria-live="polite"
        hidden={!inspectorOpen}
        tabIndex={-1}
      >
        <header className="metro-details-header">
          <button
            type="button"
            className="metro-details-collapse"
            aria-label="Collapse inspector"
            aria-controls={detailsId}
            aria-expanded={inspectorOpen}
            onClick={() => onInspectorOpenChange(false)}
          >
            ‹ <span>collapse</span>
          </button>
          <span className="metro-details-id" title={inspectorIdentity}>{inspectorIdentity}</span>
          <button
            type="button"
            className="metro-details-close"
            aria-label="Clear Evolution selection"
            disabled={!selectedTarget}
            onClick={onClearDetailsTarget}
          >
            ×
          </button>
        </header>
        <div className="metro-details-content">
          {selectedTag ? (
            <TagInspectorSection
              {...shared}
              selectedTag={selectedTag}
              selectedInferredPreference={selectedInferredPreference}
              selectedTagStrengthProfile={selectedTagStrengthProfile}
              ratings={ratings}
              onRate={onRate}
              showInferredPreference={showInferredPreference}
              expansionMode={expansionMode}
              pinnedTagIds={pinnedTagIds}
              onAddSeed={onAddSeed}
              onTogglePinnedTag={onTogglePinnedTag}
              onExcludeTag={onExcludeTag}
            />
          ) : selectedBundle ? (
            <BundleInspectorSection
              {...shared}
              selectedBundle={selectedBundle}
              selectedBundleRouteStationIds={selectedBundleRouteStationIds}
              selectedBundleTagGroups={selectedBundleTagGroups}
              onExpandBundledTags={onExpandBundledTags}
            />
          ) : selectedStation ? (
            <StationInspectorSection
              {...shared}
              selectedStation={selectedStation}
              selectedHierarchyParent={selectedHierarchyParent}
              selectedExpandedHierarchyParentId={selectedExpandedHierarchyParentId}
              selectedAggregateMemberships={selectedAggregateMemberships}
              selectedStationBundles={selectedStationBundles}
              selectedVisibleTagGroups={selectedVisibleTagGroups}
              selectedUnderlyingAssignments={selectedUnderlyingAssignments}
              selectedAtomicRelations={selectedAtomicRelations}
              provenanceGroups={provenanceGroups}
              selectedStationContextStateCount={selectedStationContextStateCount}
              expansionMode={expansionMode}
              refinedWorkId={refinedWorkId}
              onOpen={onOpen}
              onRefineWork={onRefineWork}
              onExpandHierarchy={onExpandHierarchy}
              onCollapseHierarchy={onCollapseHierarchy}
            />
          ) : selectedRelation ? (
            <RelationInspectorSection
              {...shared}
              selectedRelation={selectedRelation}
              selectedRelationSharedTags={selectedRelationSharedTags}
              selectedRelationSharedTagGroups={selectedRelationSharedTagGroups}
              selectedRelationBundles={selectedRelationBundles}
            />
          ) : (
            <EmptyInspectorSection
              seedTagIds={seedTagIds}
              excludedTagIds={excludedTagIds}
              earlierDepth={earlierDepth}
              laterDepth={laterDepth}
              expansionMode={expansionMode}
            />
          )}
        </div>
      </aside>
    </>
  );
}
