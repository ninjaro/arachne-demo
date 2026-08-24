import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
} from "react";
import type { OpenHandler } from "./common";
import {
  aggregateStationRepresentedWorkCount,
} from "../lib/evolution";
import type {
  AggregateStation,
  DirectionalReachInfo,
  EvolutionIndex,
  VisibleEvolution,
} from "../lib/evolution";
import { sameEvolutionInteraction } from "../lib/evolution-interaction";
import type { EvolutionInteractionTarget } from "../lib/evolution-interaction";
import { trajectorySegmentWidth } from "../lib/evolution-strength";
import type {
  MetroBucket,
  MetroExplicitRelation,
  MetroRenderableTrajectoryGroup,
  MetroScene,
  MetroStation,
} from "../lib/timenets";
import { humanize } from "../lib/format";

type ReachDisplay = Pick<
  DirectionalReachInfo,
  "depth" | "seedDepth" | "earlierDepth" | "laterDepth"
>;

export interface EvolutionCanvasProps {
  scene: MetroScene;
  visible: VisibleEvolution;
  index: EvolutionIndex;
  renderTrajectoryGroups: readonly MetroRenderableTrajectoryGroup[];
  hasSeedTags: boolean;
  zoom: number;
  titleId: string;
  descriptionId: string;
  detailsId: string;
  tooltipId: string;
  selection: EvolutionInteractionTarget | null;
  hover: EvolutionInteractionTarget | null;
  rovingFocusTarget: EvolutionInteractionTarget | null;
  selectedTemporalBucketId: string | null;
  bucketEmphasis: (bucketId: string) => "selected" | "preview" | null;
  interactionClasses: (
    kind: EvolutionInteractionTarget["kind"],
    id: string,
  ) => readonly string[];
  onClearSelection: () => void;
  onPreviewTarget: (
    target: EvolutionInteractionTarget,
    node: SVGGElement,
    immediate?: boolean,
  ) => void;
  onStopPreview: (target: EvolutionInteractionTarget) => void;
  onFocusTarget: (target: EvolutionInteractionTarget) => void;
  onSelectTarget: (target: EvolutionInteractionTarget) => void;
  onOpen: OpenHandler;
}

function activateOnKeyboard(
  event: KeyboardEvent<SVGGElement>,
  action: () => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    action();
    return;
  }

  const direction =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
  if (!direction && event.key !== "Home" && event.key !== "End") return;
  const svg = event.currentTarget.ownerSVGElement;
  if (!svg) return;
  const items = [...svg.querySelectorAll<SVGGElement>("[data-metro-interactive]")];
  if (!items.length) return;
  const currentIndex = items.indexOf(event.currentTarget);
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (Math.max(0, currentIndex) + direction + items.length) % items.length;
  event.preventDefault();
  event.stopPropagation();
  items[nextIndex]?.focus();
}

function effectiveDepth(reach: ReachDisplay): number {
  if (reach.seedDepth === 0) return 0;
  return Math.min(
    reach.earlierDepth ?? Number.POSITIVE_INFINITY,
    reach.laterDepth ?? Number.POSITIVE_INFINITY,
    Number.isFinite(reach.depth) ? reach.depth : Number.POSITIVE_INFINITY,
  );
}

function depthClass(reach: ReachDisplay): string {
  const depth = effectiveDepth(reach);
  return `depth-${Math.min(4, Math.max(0, Number.isFinite(depth) ? depth : 4))}`;
}

function directionClass(reach: ReachDisplay): string {
  if (reach.seedDepth === 0) return "direction-seed";
  if (reach.earlierDepth !== null && reach.laterDepth !== null) {
    return "direction-both";
  }
  if (reach.earlierDepth !== null) return "direction-earlier";
  if (reach.laterDepth !== null) return "direction-later";
  return "direction-context";
}

function reachSummary(reach: ReachDisplay): string {
  if (reach.seedDepth === 0) return "Seed trajectory · depth 0";
  const parts: string[] = [];
  if (reach.earlierDepth !== null) parts.push(`earlier ${reach.earlierDepth}`);
  if (reach.laterDepth !== null) parts.push(`later ${reach.laterDepth}`);
  return parts.length ? parts.join(" · ") : "Visible context";
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

function truncatedLabel(value: string, limit = 30): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function stationAnnotation(
  index: EvolutionIndex,
  station: MetroStation,
  fallbackTitle: string,
): { title: string; metadata: string } {
  const representedCount = aggregateStationRepresentedWorkCount(station.entry);
  const representativeId = station.entry.hierarchyParentId ?? station.entry.workIds[0];
  const representative = representativeId
    ? index.domain.workById.get(representativeId)
    : null;
  const contributor = representative?.contributors.find(
    (candidate) => candidate.importance === "primary",
  ) ?? representative?.contributors[0];
  const metadata = [
    station.entry.temporal.displayLabel,
    representedCount > 1
      ? aggregateCountLabel(station.entry)
      : representative
        ? humanize(representative.medium)
        : null,
    contributor?.creditedAs ?? contributor?.label ?? null,
  ].filter((value): value is string => Boolean(value));
  return {
    title: representative?.label ?? fallbackTitle,
    metadata: metadata.join(" · "),
  };
}

export interface EvolutionStationMarkerGeometry {
  coreRadius: number;
  structuralRadius: number;
  knockoutRadius: number;
  dateHaloRadius: number;
  hitRadius: number;
}

/** Shared marker geometry for single-work, aggregate, and interchange stops. */
export function evolutionStationMarkerGeometry({
  aggregate,
  interchange,
  workCount,
}: {
  aggregate: boolean;
  interchange: boolean;
  workCount: number;
}): EvolutionStationMarkerGeometry {
  const aggregateGrowth = Math.min(
    5,
    Math.log2(Math.max(2, workCount)) * 1.25,
  );
  const coreRadius = aggregate
    ? Math.max(
        8.5 + aggregateGrowth,
        7 + String(Math.max(1, workCount)).length * 1.5,
      )
    : 6;
  const structuralRadius = coreRadius + (interchange ? (aggregate ? 4 : 3.75) : 0);
  return {
    coreRadius,
    structuralRadius,
    knockoutRadius: structuralRadius + 2.6,
    dateHaloRadius: structuralRadius + 4.4,
    hitRadius: Math.max(13, structuralRadius + 5.5),
  };
}

export function shouldRenderTemporalRegion(
  bucket: Pick<MetroBucket, "interval" | "ambiguous" | "temporal">,
): boolean {
  return (
    bucket.temporal.precision !== "day" &&
    (bucket.interval || bucket.ambiguous)
  );
}

export function EvolutionCanvas({
  scene,
  visible,
  index,
  renderTrajectoryGroups,
  hasSeedTags,
  zoom,
  titleId,
  descriptionId,
  detailsId,
  tooltipId,
  selection,
  hover,
  rovingFocusTarget,
  selectedTemporalBucketId,
  bucketEmphasis,
  interactionClasses,
  onClearSelection,
  onPreviewTarget,
  onStopPreview,
  onFocusTarget,
  onSelectTarget,
  onOpen,
}: EvolutionCanvasProps) {
  if (!hasSeedTags) {
    return (
      <div className="metro-chart-shell">
        <div className="metro-empty">
          <h3>Choose at least one seed tag</h3>
          <p>The selected tag trajectories and their accepted temporal stops will appear here.</p>
        </div>
      </div>
    );
  }

  if (!scene.stations.length) {
    return (
      <div className="metro-chart-shell">
        <div className="metro-empty">
          <h3>No accepted stations</h3>
          <p>Adjust the date-quality filters or choose another seed tag.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="metro-chart-shell">
      <div className="metro-scroll">
        <svg
          className="metro-canvas"
          width={scene.width * zoom}
          height={scene.height * zoom}
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          preserveAspectRatio="xMinYMin meet"
          role="group"
          aria-labelledby={`${titleId} ${descriptionId}`}
          onClick={onClearSelection}
        >
          <title id={titleId}>Tag-centered historical Evolution map</title>
          <desc id={descriptionId}>
            Variable-width tag trajectories and equivalent-tag bundles pass through
            dated work, interchange, and aggregate stations. Independent earlier and later
            budgets add directional or connected context. Horizontal order is chronological,
            while distance does not encode duration. Explicit work relations remain a separate
            arrow layer. Arrow keys move among items; Enter or Space creates persistent focus.
          </desc>
          <defs>
            <marker
              id="metro-explicit-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>

          <g className="metro-axis-layer" aria-hidden="true">
            <line
              x1={0}
              x2={scene.width}
              y1={64}
              y2={64}
              className="evolution-axis-rule"
              vectorEffect="non-scaling-stroke"
            />
            {scene.years.map((year, yearIndex) => (
              <g key={year.year}>
                <rect
                  x={year.xStart}
                  y={94}
                  width={year.xEnd - year.xStart}
                  height={scene.height - 122}
                  className={[
                    "metro-year-band",
                    yearIndex % 2 === 0 ? "alternate" : "",
                    year.hasYearInterval ? "has-interval" : "",
                    year.hasAmbiguity ? "has-ambiguity" : "",
                  ].filter(Boolean).join(" ")}
                />
                <line
                  x1={year.xStart}
                  x2={year.xStart}
                  y1={53}
                  y2={scene.height - 28}
                  className="metro-year-tick"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={(year.xStart + year.xEnd) / 2}
                  y={43}
                  textAnchor="middle"
                  className={[
                    "metro-year-label",
                    scene.bucketById.get(selectedTemporalBucketId ?? "")?.temporal.year === year.year
                      ? "selected"
                      : "",
                  ].filter(Boolean).join(" ")}
                >
                  {year.year}
                </text>
                {year.hasYearInterval ? (
                  <path
                    d={`M ${year.contentStart} 57 L ${year.contentStart} 64 L ${year.contentEnd} 64 L ${year.contentEnd} 57`}
                    className="metro-year-interval-bracket"
                  />
                ) : null}
              </g>
            ))}
            {scene.buckets
              .filter(shouldRenderTemporalRegion)
              .map((bucket) => {
                const emphasis = bucketEmphasis(bucket.id);
                return (
                  <rect
                    key={`bucket:${bucket.id}`}
                    x={bucket.xStart}
                    y={88}
                    width={Math.max(2, bucket.xEnd - bucket.xStart)}
                    height={scene.height - 112}
                    data-temporal-region={bucket.temporal.precision}
                    className={[
                      "metro-bucket",
                      bucket.temporal.precision === "month" ? "month-interval" : "year-only",
                      bucket.ambiguous ? "ambiguous" : "",
                      emphasis ?? "",
                    ].filter(Boolean).join(" ")}
                  />
                );
              })}
            {scene.buckets
              .filter((bucket) => !bucket.interval && bucketEmphasis(bucket.id))
              .map((bucket) => {
                const emphasis = bucketEmphasis(bucket.id)!;
                return (
                  <path
                    key={`cue:${bucket.id}`}
                    d={`M ${bucket.x - 5} 87 L ${bucket.x - 5} 82 L ${bucket.x + 5} 82 L ${bucket.x + 5} 87`}
                    data-exact-bucket-cue="true"
                    className={`metro-bucket-axis-cue ${emphasis}`}
                  />
                );
              })}
            {scene.dateLabels.map((label) => (
              <text key={label.key} x={label.x} y={80} textAnchor="middle" className="metro-date-label">
                {label.text}
              </text>
            ))}
            <text x={96} y={20} className="metro-axis-title">
              ADAPTIVE TEMPORAL ORDER · COMPRESSED GAPS
            </text>
          </g>

          <g className="metro-trajectory-layer">
            {renderTrajectoryGroups.map((group) => {
              const representative = scene.trajectoryById.get(group.tagIds[0]!)!;
              const entry = representative.entry;
              const target: EvolutionInteractionTarget = group.kind === "bundle"
                ? { kind: "bundle", id: group.id }
                : { kind: "tag", id: group.tagIds[0]! };
              const interaction = interactionClasses(target.kind, target.id);
              const style = {
                "--tag-color": group.kind === "bundle" ? "#aeb9bb" : group.color,
              } as CSSProperties;
              const label = group.kind === "bundle"
                ? `${group.tagIds.length} tags`
                : entry.tag.label;
              return (
                <g
                  key={group.id}
                  className={[
                    "metro-trajectory",
                    group.kind === "bundle" ? "trajectory-bundle" : "trajectory-singleton",
                    group.reach.seed ? "seed" : "context-line",
                    depthClass(group.reach),
                    directionClass(group.reach),
                    ...interaction,
                  ].filter(Boolean).join(" ")}
                  style={style}
                  role="button"
                  tabIndex={sameEvolutionInteraction(rovingFocusTarget, target) ? 0 : -1}
                  data-metro-interactive="true"
                  data-trajectory-kind={group.kind}
                  aria-pressed={sameEvolutionInteraction(selection, target)}
                  aria-controls={detailsId}
                  aria-describedby={sameEvolutionInteraction(hover, target) ? tooltipId : undefined}
                  aria-label={group.kind === "bundle"
                    ? `${group.tagIds.length} bundled tags, ${reachSummary(group.reach)}, ${group.stationIds.length} shared aggregate stops`
                    : `${entry.tag.label}, ${reachSummary(entry)}, ${group.stationIds.length} aggregate stops`}
                  onPointerEnter={(event: PointerEvent<SVGGElement>) => onPreviewTarget(target, event.currentTarget)}
                  onPointerLeave={() => onStopPreview(target)}
                  onFocus={(event) => {
                    onFocusTarget(target);
                    onPreviewTarget(target, event.currentTarget, true);
                  }}
                  onBlur={() => onStopPreview(target)}
                  onClick={(event: MouseEvent<SVGGElement>) => {
                    event.stopPropagation();
                    onSelectTarget(target);
                  }}
                  onKeyDown={(event) => activateOnKeyboard(event, () => onSelectTarget(target))}
                >
                  {group.segments.map((segment) => (
                    <path
                      key={segment.key}
                      d={segment.ribbonPath}
                      className="metro-line-visible metro-line-ribbon metro-strength-segment"
                      data-strength={segment.displayStrength ?? "unknown"}
                      style={{ "--segment-width": `${segment.width}px` } as CSSProperties}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {group.stationPorts.map((port) => {
                    const station = scene.stationById.get(port.stationId)!;
                    const strengths = group.tagIds
                      .map((tagId) => visible.aggregateMembershipsByTagId
                        .get(tagId)
                        ?.find((membership) => membership.stationId === station.id)
                        ?.strength ?? null)
                      .filter((strength): strength is number => strength !== null);
                    const strength = strengths.length ? Math.max(...strengths) : null;
                    const path = [
                      `M ${port.left.x} ${port.left.y}`,
                      `C ${station.x - 3} ${port.left.y}, ${station.x - 3} ${station.y}, ${station.x} ${station.y}`,
                      `C ${station.x + 3} ${station.y}, ${station.x + 3} ${port.right.y}, ${port.right.x} ${port.right.y}`,
                    ].join(" ");
                    return (
                      <path
                        key={`port-route:${group.id}:${station.id}`}
                        d={path}
                        className="metro-line-visible metro-station-port-route"
                        data-strength={strength ?? "unknown"}
                        style={{ "--segment-width": `${trajectorySegmentWidth(strength)}px` } as CSSProperties}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                  <path d={group.path} className="metro-line-hit" vectorEffect="non-scaling-stroke" />
                  <text x={representative.origin.x} y={representative.laneY - 10} className="metro-tag-label">
                    <tspan className="metro-tag-label-title">{truncatedLabel(label)}</tspan>
                    <tspan className="metro-tag-label-meta">
                      {group.kind === "bundle"
                        ? " · bundle"
                        : ` · ${humanize(entry.tag.conceptType)}${entry.seed ? " · seed" : ""}`}
                    </tspan>
                  </text>
                  {group.kind === "bundle" ? (
                    <g className="metro-bundle-count" transform={`translate(${representative.origin.x + 7} ${representative.laneY + 4})`}>
                      <circle r={6.5} />
                      <text y={2.3}>{group.tagIds.length}</text>
                    </g>
                  ) : null}
                  {!group.reach.seed && group.reach.earlierDepth !== null && group.reach.laterDepth === null ? (
                    <text x={representative.origin.x - 2} y={representative.laneY + 4} className="metro-direction-marker">←</text>
                  ) : null}
                  {!group.reach.seed && group.reach.laterDepth !== null && group.reach.earlierDepth === null ? (
                    <text x={representative.end.x + 5} y={representative.end.y + 4} className="metro-direction-marker">→</text>
                  ) : null}
                </g>
              );
            })}
          </g>

          <g className="metro-explicit-layer">
            {scene.explicitRelations.map((entry: MetroExplicitRelation) => {
              const target = { kind: "relation" as const, id: entry.key };
              const conflicts = entry.relation.relations.filter((relation) => relation.chronologyConflict).length;
              return (
                <g
                  key={entry.key}
                  className={[
                    "metro-explicit-relation",
                    conflicts ? "chronology-conflict" : "",
                    entry.relation.relations.length > 1 ? "aggregate-relation" : "",
                    ...interactionClasses("relation", entry.key),
                  ].filter(Boolean).join(" ")}
                  role="button"
                  tabIndex={sameEvolutionInteraction(rovingFocusTarget, target) ? 0 : -1}
                  data-metro-interactive="true"
                  aria-pressed={sameEvolutionInteraction(selection, target)}
                  aria-controls={detailsId}
                  aria-describedby={sameEvolutionInteraction(hover, target) ? tooltipId : undefined}
                  aria-label={`${entry.relation.relations.length} explicit ${entry.relation.relations.length === 1 ? "relation" : "relations"}, ${entry.relation.relationTypes.map(humanize).join(", ")}${conflicts ? `, ${conflicts} chronology conflicts` : ""}`}
                  onPointerEnter={(event: PointerEvent<SVGGElement>) => onPreviewTarget(target, event.currentTarget)}
                  onPointerLeave={() => onStopPreview(target)}
                  onFocus={(event) => {
                    onFocusTarget(target);
                    onPreviewTarget(target, event.currentTarget, true);
                  }}
                  onBlur={() => onStopPreview(target)}
                  onClick={(event: MouseEvent<SVGGElement>) => {
                    event.stopPropagation();
                    onSelectTarget(target);
                  }}
                  onKeyDown={(event) => activateOnKeyboard(event, () => onSelectTarget(target))}
                >
                  <path d={entry.path} className="metro-relation-visible" markerEnd="url(#metro-explicit-arrow)" vectorEffect="non-scaling-stroke" />
                  <path d={entry.path} className="metro-relation-hit" vectorEffect="non-scaling-stroke" />
                  {entry.relation.relations.length > 1 ? (
                    <g transform={`translate(${(entry.source.x + entry.target.x) / 2} ${(entry.source.y + entry.target.y) / 2 - 7})`} className="metro-relation-count">
                      <circle r={7} />
                      <text y={2.5}>{entry.relation.relations.length}</text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>

          <g className="metro-station-layer">
            {scene.stations.map((station) => {
              const target = { kind: "station" as const, id: station.id };
              const marker = evolutionStationMarkerGeometry({
                aggregate: station.aggregate,
                interchange: station.interchange,
                workCount: aggregateStationRepresentedWorkCount(station.entry),
              });
              const ambiguousHalfSize = marker.dateHaloRadius / Math.SQRT2;
              const interchangeYValues = station.ports.flatMap((port) => [
                port.left.y - station.y,
                port.right.y - station.y,
              ]);
              const interchangeTop = Math.min(
                -marker.structuralRadius,
                ...(interchangeYValues.length ? interchangeYValues : [0]),
              ) - 2;
              const interchangeBottom = Math.max(
                marker.structuralRadius,
                ...(interchangeYValues.length ? interchangeYValues : [0]),
              ) + 2;
              const aggregateWidth = Math.max(18, marker.coreRadius * 2.5);
              const stationColor = station.visibleTagIds
                .map((tagId) => scene.trajectoryById.get(tagId)?.color)
                .find((color): color is string => Boolean(color)) ?? "#cfd7d6";
              return (
                <g
                  key={station.id}
                  transform={`translate(${station.x} ${station.y})`}
                  style={{ "--station-color": stationColor } as CSSProperties}
                  className={[
                    "metro-station",
                    station.interchange ? "interchange" : "",
                    station.aggregate ? "aggregate" : "single-work",
                    station.entry.temporal.quality,
                    station.entry.temporal.precision,
                    depthClass(station.entry),
                    directionClass(station.entry),
                    ...interactionClasses("station", station.id),
                  ].filter(Boolean).join(" ")}
                  role="button"
                  tabIndex={sameEvolutionInteraction(rovingFocusTarget, target) ? 0 : -1}
                  data-metro-interactive="true"
                  aria-pressed={sameEvolutionInteraction(selection, target)}
                  aria-controls={detailsId}
                  aria-describedby={sameEvolutionInteraction(hover, target) ? tooltipId : undefined}
                  aria-label={`${aggregateCountLabel(station.entry)}, ${station.entry.temporal.displayLabel}, ${dateQualityLabel(station)}, ${reachSummary(station.entry)}, ${station.visibleTagIds.length} visible tags${station.interchange ? ", interchange" : ""}`}
                  onPointerEnter={(event: PointerEvent<SVGGElement>) => onPreviewTarget(target, event.currentTarget)}
                  onPointerLeave={() => onStopPreview(target)}
                  onFocus={(event) => {
                    onFocusTarget(target);
                    onPreviewTarget(target, event.currentTarget, true);
                  }}
                  onBlur={() => onStopPreview(target)}
                  onClick={(event: MouseEvent<SVGGElement>) => {
                    event.stopPropagation();
                    onSelectTarget(target);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    if (aggregateStationRepresentedWorkCount(station.entry) === 1) {
                      onOpen(station.entry.workIds[0]!);
                    }
                  }}
                  onKeyDown={(event) => activateOnKeyboard(event, () => onSelectTarget(target))}
                >
                  <circle r={marker.hitRadius} className="metro-station-hit" />
                  <circle
                    r={marker.knockoutRadius}
                    className="metro-station-knockout"
                    data-station-knockout="true"
                  />
                  <g className="metro-station-visible">
                    {station.entry.temporal.quality === "year-only" ? <circle r={marker.dateHaloRadius} className="metro-station-halo year" /> : null}
                    {station.entry.temporal.precision === "month" && station.entry.temporal.quality !== "ambiguous" ? <circle r={marker.dateHaloRadius} className="metro-station-halo month" /> : null}
                    {station.entry.temporal.quality === "ambiguous" ? (
                      <rect x={-ambiguousHalfSize} y={-ambiguousHalfSize} width={ambiguousHalfSize * 2} height={ambiguousHalfSize * 2} className="metro-station-halo ambiguous" transform="rotate(45)" />
                    ) : null}
                    {station.aggregate ? (
                      <rect
                        x={-aggregateWidth / 2}
                        y={-5.5}
                        width={aggregateWidth}
                        height={11}
                        rx={5.5}
                        className="metro-aggregate-ring metro-aggregate-glyph"
                      />
                    ) : (
                      <circle r={marker.coreRadius} className="metro-station-core metro-single-station-ring" />
                    )}
                    {station.interchange ? (
                      <rect
                        x={-4.5}
                        y={interchangeTop}
                        width={9}
                        height={interchangeBottom - interchangeTop}
                        rx={4.5}
                        className="metro-interchange-ring metro-interchange-cap"
                      />
                    ) : null}
                    {station.aggregate ? (
                      <text y={2.5} className="metro-aggregate-count">{aggregateStationRepresentedWorkCount(station.entry)}</text>
                    ) : (
                      <circle r={1.45} className="metro-station-center" />
                    )}
                  </g>
                </g>
              );
            })}
          </g>

          <g className="metro-work-label-layer" aria-hidden="true">
            {scene.workLabels.map((label) => {
              const station = scene.stationById.get(label.stationId);
              if (!station) return null;
              const annotation = stationAnnotation(index, station, label.text);
              const anchor = label.x >= station.x ? "start" : "end";
              const x = anchor === "start" ? label.x : label.x + label.width;
              const selected = sameEvolutionInteraction(selection, {
                kind: "station",
                id: station.id,
              });
              return (
                <g
                  key={label.key}
                  className={[
                    "metro-work-label",
                    station.aggregate ? "aggregate" : "",
                    selected ? "selected" : "",
                  ].filter(Boolean).join(" ")}
                  transform={`translate(${x} ${label.y})`}
                  data-label-anchor={anchor}
                >
                  {selected ? (
                    <rect
                      x={anchor === "start" ? -5 : -label.width - 5}
                      y={-13}
                      width={label.width + 10}
                      height={29}
                      rx={4}
                      className="metro-work-label-backdrop"
                    />
                  ) : null}
                  <text textAnchor={anchor} className="metro-work-label-title">
                    {truncatedLabel(annotation.title, 32)}
                  </text>
                  <text y={11} textAnchor={anchor} className="metro-work-label-meta">
                    {truncatedLabel(annotation.metadata, 46)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
