import type { CSSProperties, ReactNode } from "react";

export interface EvolutionTrajectoryLegendItem {
  id: string;
  label: string;
  color: string;
  count: number;
  seed: boolean;
  selected: boolean;
}

function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

export function EvolutionSceneStatus({
  trajectoryCount,
  stationCount,
  interchangeCount,
  aggregateCount,
  context,
  warnings,
}: {
  trajectoryCount: number;
  stationCount: number;
  interchangeCount: number;
  aggregateCount: number;
  context: string;
  warnings?: ReactNode;
}) {
  return (
    <div className="evolution-scene-status">
      <strong className="evolution-scene-status__counts">
        {counted(trajectoryCount, "trajectory")} · {counted(stationCount, "station")} ·{" "}
        {counted(interchangeCount, "interchange")} · {counted(aggregateCount, "aggregate")}
      </strong>
      <span className="evolution-scene-status__note">
        Chronological order · dense years wider · ties reordered
      </span>
      <span className="evolution-scene-status__note">{context}</span>
      {warnings ? <span className="evolution-scene-status__warning">{warnings}</span> : null}
    </div>
  );
}

export function EvolutionLegend({
  trajectories,
  hiddenCount,
}: {
  trajectories: readonly EvolutionTrajectoryLegendItem[];
  hiddenCount: number;
}) {
  return (
    <footer className="evolution-bottom-legend" aria-label="Evolution map legend">
      <div className="evolution-trajectory-tokens" aria-label="Visible trajectories">
        {trajectories.map((trajectory) => (
          <span
            key={trajectory.id}
            className={[
              "evolution-trajectory-token",
              trajectory.seed ? "is-seed" : "",
              trajectory.selected ? "is-selected" : "",
            ].filter(Boolean).join(" ")}
            style={{ "--tag-color": trajectory.color } as CSSProperties}
          >
            <i className="evolution-trajectory-token__swatch" aria-hidden="true" />
            <span className="evolution-trajectory-token__label">{trajectory.label}</span>
            <span className="evolution-trajectory-token__count">{trajectory.count.toLocaleString()}</span>
          </span>
        ))}
        {hiddenCount ? (
          <span className="evolution-trajectory-token is-hidden">
            {hiddenCount.toLocaleString()} hidden
          </span>
        ) : null}
      </div>

      <div className="evolution-symbol-legend" aria-label="Evolution symbols">
        <span className="evolution-symbol-key station"><i aria-hidden="true" />station</span>
        <span className="evolution-symbol-key interchange"><i aria-hidden="true" />interchange</span>
        <span className="evolution-symbol-key aggregate"><i aria-hidden="true" />aggregate</span>
        <span className="evolution-symbol-key relation"><i aria-hidden="true" />documented relation</span>
        <span className="evolution-symbol-key strength"><i aria-hidden="true" />thickness = centrality</span>
      </div>
    </footer>
  );
}
