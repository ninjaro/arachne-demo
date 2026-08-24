import type { EvolutionTag, ExpansionMode } from "../lib/evolution";
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
  hiddenTrajectoryCount: number;
  protectedBeyondLimitCount: number;
  zoom: number;
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
  hiddenTrajectoryCount,
  protectedBeyondLimitCount,
  zoom,
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

  return (
    <div className="metro-controls">
      <TagPicker
        label="Included seed tags"
        placeholder="Search tags to include"
        mode="include"
        options={options}
        selectedIds={seedTagIds}
        blockedIds={excludedTagIds}
        onAdd={onAddSeed}
        onRemove={onRemoveSeed}
      />
      <TagPicker
        label="Excluded tags"
        placeholder="Search tags to exclude"
        mode="exclude"
        options={options}
        selectedIds={excludedTagIds}
        blockedIds={seedTagIds}
        onAdd={onAddExclusion}
        onRemove={onRemoveExclusion}
      />
      <div className="metro-depth-control">
        <label htmlFor="metro-earlier-depth">Earlier depth <strong>{earlierDepth}</strong></label>
        <input
          id="metro-earlier-depth"
          type="range"
          min={0}
          max={4}
          step={1}
          value={earlierDepth}
          onChange={(event) => onEarlierDepthChange(Number(event.target.value))}
        />
        <small>Historical predecessors</small>
      </div>
      <div className="metro-depth-control">
        <label htmlFor="metro-later-depth">Later depth <strong>{laterDepth}</strong></label>
        <input
          id="metro-later-depth"
          type="range"
          min={0}
          max={4}
          step={1}
          value={laterDepth}
          onChange={(event) => onLaterDepthChange(Number(event.target.value))}
        />
        <small>Later development</small>
      </div>
      <div className="metro-control-actions">
        <button type="button" onClick={onClearTags}>Clear tags</button>
        <button type="button" onClick={onResetView}>Reset view</button>
        <label>
          Zoom
          <input
            type="range"
            min="0.6"
            max="1.5"
            step="0.05"
            value={zoom}
            onChange={(event) => onZoomChange(Number(event.target.value))}
          />
        </label>
      </div>
      <details className="metro-advanced-controls">
        <summary>Advanced</summary>
        <div className="metro-advanced-controls-grid">
          <fieldset className="metro-expansion-mode">
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
          <fieldset className="metro-date-controls">
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
          <fieldset className="metro-taste-controls">
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
          <div className="metro-trajectory-limit">
            <label htmlFor="metro-visible-trajectory-limit">
              Visible trajectories <strong>{visibleTrajectoryLimit}</strong>
            </label>
            <div>
              <button
                type="button"
                aria-label="Decrease visible trajectory limit"
                disabled={visibleTrajectoryLimit <= MIN_VISIBLE_TRAJECTORY_LIMIT}
                onClick={() => changeVisibleTrajectoryLimit(
                  visibleTrajectoryLimit - VISIBLE_TRAJECTORY_LIMIT_STEP,
                )}
              >−</button>
              <input
                id="metro-visible-trajectory-limit"
                type="number"
                min={MIN_VISIBLE_TRAJECTORY_LIMIT}
                max={MAX_VISIBLE_TRAJECTORY_LIMIT}
                step={VISIBLE_TRAJECTORY_LIMIT_STEP}
                value={visibleTrajectoryLimit}
                onChange={(event) => changeVisibleTrajectoryLimit(Number(event.target.value))}
              />
              <button
                type="button"
                aria-label="Increase visible trajectory limit"
                disabled={visibleTrajectoryLimit >= MAX_VISIBLE_TRAJECTORY_LIMIT}
                onClick={() => changeVisibleTrajectoryLimit(
                  visibleTrajectoryLimit + VISIBLE_TRAJECTORY_LIMIT_STEP,
                )}
              >+</button>
            </div>
            <small>
              {hiddenTrajectoryCount.toLocaleString()} eligible hidden
              {protectedBeyondLimitCount
                ? ` · ${protectedBeyondLimitCount.toLocaleString()} protected beyond limit`
                : ""}
            </small>
          </div>
        </div>
      </details>
    </div>
  );
}
