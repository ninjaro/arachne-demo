import type { EvolutionTag, ExpansionMode } from "../lib/evolution";
import type { ReactNode } from "react";
import {
  MAX_VISIBLE_TRAJECTORY_LIMIT,
  MIN_VISIBLE_TRAJECTORY_LIMIT,
  VISIBLE_TRAJECTORY_LIMIT_STEP,
  normalizeVisibleTrajectoryLimit,
} from "../lib/evolution-trajectory-selection";
import type { EntityId } from "../lib/types";
import { TagPicker } from "./TagPicker";

export type EvolutionTasteFilter = "all" | "positive" | "negative" | "unrated";

export interface EvolutionControlsProps {
  options: readonly EvolutionTag[];
  seedTagIds: readonly EntityId[];
  excludedTagIds: readonly EntityId[];
  earlierDepth: number;
  laterDepth: number;
  expansionMode: ExpansionMode;
  includeYearOnly: boolean;
  includeAmbiguous: boolean;
  tasteFilter: EvolutionTasteFilter;
  hideDislikedTags: boolean;
  showInferredPreference: boolean;
  canUseTaste: boolean;
  visibleTrajectoryLimit: number;
  visibleTrajectoryCount?: number;
  eligibleTrajectoryCount?: number;
  hiddenTrajectoryCount: number;
  protectedBeyondLimitCount: number;
  zoom: number;
  status?: ReactNode;
  onAddSeed: (id: EntityId) => void;
  onRemoveSeed: (id: EntityId) => void;
  onAddExclusion: (id: EntityId) => void;
  onRemoveExclusion: (id: EntityId) => void;
  onEarlierDepthChange: (value: number) => void;
  onLaterDepthChange: (value: number) => void;
  onExpansionModeChange: (value: ExpansionMode) => void;
  onIncludeYearOnlyChange: (value: boolean) => void;
  onIncludeAmbiguousChange: (value: boolean) => void;
  onTasteFilterChange: (value: EvolutionTasteFilter) => void;
  onHideDislikedTagsChange: (value: boolean) => void;
  onShowInferredPreferenceChange: (value: boolean) => void;
  onUseTaste: () => void;
  onVisibleTrajectoryLimitChange: (value: number) => void;
  onClearTags: () => void;
  onResetView: () => void;
  onZoomChange: (value: number) => void;
}

export function EvolutionControls({
  options,
  seedTagIds,
  excludedTagIds,
  earlierDepth,
  laterDepth,
  expansionMode,
  includeYearOnly,
  includeAmbiguous,
  tasteFilter,
  hideDislikedTags,
  showInferredPreference,
  canUseTaste,
  visibleTrajectoryLimit,
  visibleTrajectoryCount,
  eligibleTrajectoryCount,
  hiddenTrajectoryCount,
  protectedBeyondLimitCount,
  zoom,
  status,
  onAddSeed,
  onRemoveSeed,
  onAddExclusion,
  onRemoveExclusion,
  onEarlierDepthChange,
  onLaterDepthChange,
  onExpansionModeChange,
  onIncludeYearOnlyChange,
  onIncludeAmbiguousChange,
  onTasteFilterChange,
  onHideDislikedTagsChange,
  onShowInferredPreferenceChange,
  onUseTaste,
  onVisibleTrajectoryLimitChange,
  onClearTags,
  onResetView,
  onZoomChange,
}: EvolutionControlsProps) {
  const changeVisibleTrajectoryLimit = (value: number) =>
    onVisibleTrajectoryLimitChange(normalizeVisibleTrajectoryLimit(value));

  const activeFilterCount = [
    excludedTagIds.length > 0,
    expansionMode !== "directional",
    !includeYearOnly,
    includeAmbiguous,
    tasteFilter !== "all",
    hideDislikedTags,
    !showInferredPreference,
  ].filter(Boolean).length;
  const shownTrajectoryCount = visibleTrajectoryCount ?? (
    visibleTrajectoryLimit + protectedBeyondLimitCount
  );
  const totalEligibleTrajectoryCount = eligibleTrajectoryCount ?? (
    shownTrajectoryCount + hiddenTrajectoryCount
  );
  const changeZoom = (value: number) => {
    const bounded = Math.min(1.5, Math.max(0.6, value));
    onZoomChange(Math.round(bounded * 20) / 20);
  };

  return (
    <div className="metro-controls evolution-controls">
      <div className="evolution-command-bar" aria-label="Evolution trajectory controls">
        <TagPicker
          label="Seeds"
          placeholder="+ trajectory"
          mode="include"
          variant="command"
          options={options}
          selectedIds={seedTagIds}
          blockedIds={excludedTagIds}
          onAdd={onAddSeed}
          onRemove={onRemoveSeed}
        />

        <span className="evolution-command-bar__divider" aria-hidden="true" />

        <DepthStepper
          label="Earlier"
          value={earlierDepth}
          minimum={0}
          maximum={4}
          onChange={onEarlierDepthChange}
        />
        <DepthStepper
          label="Later"
          value={laterDepth}
          minimum={0}
          maximum={4}
          onChange={onLaterDepthChange}
        />

        <span className="evolution-command-bar__divider" aria-hidden="true" />

        <details className="metro-advanced-controls evolution-filter-menu">
          <summary className="evolution-command-chip evolution-filter-menu__trigger">
            <span>Filters</span>
            {activeFilterCount ? (
              <strong
                className="evolution-command-chip__badge"
                aria-label={`${activeFilterCount} active ${activeFilterCount === 1 ? "filter" : "filters"}`}
              >
                {activeFilterCount}
              </strong>
            ) : null}
          </summary>
          <div className="metro-advanced-controls-grid evolution-filter-menu__popover">
            <TagPicker
              label="Excluded trajectories"
              placeholder="Search tags to exclude"
              mode="exclude"
              variant="panel"
              options={options}
              selectedIds={excludedTagIds}
              blockedIds={seedTagIds}
              onAdd={onAddExclusion}
              onRemove={onRemoveExclusion}
            />
            <fieldset className="metro-expansion-mode evolution-filter-group">
              <legend>Expansion mode</legend>
              <label>
                <input
                  type="radio"
                  name="metro-expansion-mode"
                  value="directional"
                  checked={expansionMode === "directional"}
                  onChange={() => onExpansionModeChange("directional")}
                />
                Directional
              </label>
              <label>
                <input
                  type="radio"
                  name="metro-expansion-mode"
                  value="connected"
                  checked={expansionMode === "connected"}
                  onChange={() => onExpansionModeChange("connected")}
                />
                Connected context
              </label>
            </fieldset>
            <fieldset className="metro-date-controls evolution-filter-group">
              <legend>Date quality</legend>
              <label>
                <input
                  type="checkbox"
                  checked={includeYearOnly}
                  onChange={(event) => onIncludeYearOnlyChange(event.target.checked)}
                />
                Year-only dates
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={includeAmbiguous}
                  onChange={(event) => onIncludeAmbiguousChange(event.target.checked)}
                />
                Ranged or ambiguous
              </label>
            </fieldset>
            <fieldset className="metro-taste-controls evolution-filter-group">
              <legend>Local taste</legend>
              <select
                value={tasteFilter}
                aria-label="Filter trajectories by explicit rating"
                onChange={(event) =>
                  onTasteFilterChange(event.target.value as EvolutionTasteFilter)
                }
              >
                <option value="all">All tags</option>
                <option value="positive">Positive</option>
                <option value="negative">Negative</option>
                <option value="unrated">Unrated</option>
              </select>
              <label>
                <input
                  type="checkbox"
                  checked={hideDislikedTags}
                  onChange={(event) => onHideDislikedTagsChange(event.target.checked)}
                />
                Hide explicitly disliked tags
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showInferredPreference}
                  onChange={(event) => onShowInferredPreferenceChange(event.target.checked)}
                />
                Show inferred preference
              </label>
              <button type="button" onClick={onUseTaste} disabled={!canUseTaste}>
                Use my taste
              </button>
            </fieldset>
            <div className="evolution-filter-menu__actions">
              <button
                type="button"
                onClick={onClearTags}
                disabled={!seedTagIds.length && !excludedTagIds.length}
              >
                Clear trajectories
              </button>
            </div>
          </div>
        </details>

        <div
          className="metro-trajectory-limit evolution-command-chip evolution-visibility-control"
          title={protectedBeyondLimitCount
            ? `${protectedBeyondLimitCount.toLocaleString()} protected beyond the visibility limit`
            : undefined}
        >
          <span className="evolution-command-chip__label">Visibility</span>
          <div className="evolution-segmented-control evolution-visibility-control__stepper">
            <button
              type="button"
              aria-label="Decrease visible trajectory limit"
              disabled={visibleTrajectoryLimit <= MIN_VISIBLE_TRAJECTORY_LIMIT}
              onClick={() => changeVisibleTrajectoryLimit(
                visibleTrajectoryLimit - VISIBLE_TRAJECTORY_LIMIT_STEP,
              )}
            >
              −
            </button>
            <output aria-live="polite">
              <strong>{shownTrajectoryCount.toLocaleString()}</strong>
              <span aria-hidden="true"> / </span>
              <span>{totalEligibleTrajectoryCount.toLocaleString()}</span>
            </output>
            <button
              type="button"
              aria-label="Increase visible trajectory limit"
              disabled={visibleTrajectoryLimit >= MAX_VISIBLE_TRAJECTORY_LIMIT}
              onClick={() => changeVisibleTrajectoryLimit(
                visibleTrajectoryLimit + VISIBLE_TRAJECTORY_LIMIT_STEP,
              )}
            >
              +
            </button>
          </div>
          {protectedBeyondLimitCount ? (
            <span className="sr-status">
              {protectedBeyondLimitCount.toLocaleString()} protected beyond limit
            </span>
          ) : null}
        </div>
      </div>

      <div className="evolution-view-command-bar">
        <div className="evolution-view-command-bar__status">{status}</div>
        <div className="metro-control-actions evolution-view-command-bar__actions">
          <div className="evolution-depth-stepper evolution-zoom-stepper">
            <span className="evolution-depth-stepper__label">Zoom</span>
            <div className="evolution-segmented-control">
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoom <= 0.6}
                onClick={() => changeZoom(zoom - 0.05)}
              >
                −
              </button>
              <output aria-live="polite">{zoom.toFixed(1)}×</output>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoom >= 1.5}
                onClick={() => changeZoom(zoom + 0.05)}
              >
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            className="evolution-view-command-bar__reset"
            onClick={onResetView}
          >
            Reset view
          </button>
        </div>
      </div>
    </div>
  );
}

function DepthStepper({
  label,
  value,
  minimum,
  maximum,
  onChange,
}: {
  label: "Earlier" | "Later";
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
}) {
  const labelKey = label.toLocaleLowerCase();

  return (
    <div className={`metro-depth-control evolution-depth-stepper ${labelKey}`}>
      <span className="evolution-depth-stepper__label">{label}</span>
      <div className="evolution-segmented-control">
        <button
          type="button"
          aria-label={`Decrease ${labelKey} depth`}
          disabled={value <= minimum}
          onClick={() => onChange(Math.max(minimum, value - 1))}
        >
          −
        </button>
        <output aria-live="polite">{value}</output>
        <button
          type="button"
          aria-label={`Increase ${labelKey} depth`}
          disabled={value >= maximum}
          onClick={() => onChange(Math.min(maximum, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}
