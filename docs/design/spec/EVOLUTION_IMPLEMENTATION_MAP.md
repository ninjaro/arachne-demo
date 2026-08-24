# Evolution implementation map

This is a visual handoff only. Status describes correspondence to the primary
Evolution image, not semantic correctness or implementation quality.

| Visible design component | Current React/module | Status | Required visual correspondence |
|---|---|---|---|
| Three-column full-screen shell | [`App`](../../../src/App.tsx), `.app`, `.topbar`, `.graph-main`; `EvolutionView` `.metro-workspace` | `needs visual rewrite` | Replace the horizontal shell with fixed rail, dominant canvas, and 304px inspector composition. |
| 200px persistent left rail | No rail component | `missing` | Add rail frame without reducing the canvas to a card. |
| Brand, snapshot, and corpus totals | `App` `.brand` | `needs visual rewrite` | Move into the rail and use compact two-line metadata. |
| Evolution/Browse/Research/Taste nav with counts | `App` `VIEWS`, `.view-tabs` | `needs visual rewrite` | Vertical rows, active surface, right-aligned counts. |
| Pinned entities and seed item | [`FloatingEntityWindows`/`useEntityWindows`](../../../src/components/windows.tsx) plus local `pinnedTagIds` in `EvolutionView` | `missing` | Neither supplies the persistent mixed work/tag rail shown in the image. |
| Saved views | No current state/component | `missing` | Reference shows two static saved-view rows; product behavior is otherwise unspecified. |
| Research queue callout | Research count appears only in the Research tab | `missing` | Bottom rail callout with unresolved-date count. |
| Seed command bar | [`EvolutionControls`](../../../src/components/EvolutionControls.tsx), [`TagPicker`](../../../src/components/TagPicker.tsx) | `needs visual rewrite` | Convert sticky control column into the 67px horizontal command bar. |
| Colored removable seed tokens and “+ trajectory” | `TagPicker`, `.metro-tag-chip` | `needs visual rewrite` | Use trajectory color/tint variants and dashed add control. |
| Earlier/Later steppers | `earlierDepth`/`laterDepth` range inputs in `EvolutionControls` | `needs visual rewrite` | Separate labelled minus/value/plus segmented controls. |
| Filters badge and closed control | `.metro-advanced-controls` | `needs visual rewrite` | Compact closed chip; open popover is not specified by the image. |
| Visibility shown/eligible control | Trajectory limit and hidden/protected counts in `EvolutionControls` | `needs visual rewrite` | Compact ratio chip matching `7 / 19`. |
| Bundling on/off control | Automatic bundling in [`evolution-trajectory-projection.ts`](../../../src/lib/evolution-trajectory-projection.ts) | `missing` | Image shows a closed `Bundling on` control; off/open states are unspecified. |
| Scene summary and chronology note | `EvolutionView` `.metro-summary`, introduction/about copy | `needs visual rewrite` | One 57px status row with counts and nonmetric-time note. |
| Detail selector | Per-aggregate expansion actions only | `unclear` | Image shows `Detail works`; global behavior is not defined. |
| Zoom stepper | `zoom` state and range input | `needs visual rewrite` | Segmented minus/value/plus control. |
| Fit | No fit-to-viewport action found | `missing` | Small adjacent action. |
| Reset view | `resetView` through `EvolutionControls` | `needs visual rewrite` | Render as quiet text action beside Fit. |
| 1348×700 SVG canvas | `EvolutionView` `.metro-canvas`; [`buildTimeNetScene`](../../../src/lib/timenets.ts) | `exists` | Preserve the semantic pipeline; the reference itself uses clipped, not scrollable, presentation. |
| Adaptive year axis and grid | `EvolutionView` `.metro-axis-layer`, scene years/buckets/date labels | `needs visual rewrite` | Match the 56px axis band, sparse grid, bold selected year, and light selected guide. |
| Compressed-gap ellipsis and paired guides | Gap compression exists in layout; no glyph found | `missing` | Render the explicit ellipsis/break cue. |
| Colored, variable-width trajectories | SVG ribbon/strength segments and trajectory projection modules | `exists` | Preserve width semantics; align palette, round caps, stubs, and density. |
| Inline trajectory label with type/seed role | `.metro-tag-label` renders a shortened tag/bundle label | `needs visual rewrite` | Add uppercase name, concept type, and optional seed role. |
| Open plus trajectory terminals | Direction arrows exist, but no plus terminal glyph | `missing` | Use the outlined 15px plus terminal at open ends. |
| Work title/date/kind/credit on canvas | Work detail appears only in tooltip/inspector | `missing` | Add compact two-line annotations using the observed start/center/end anchors; collision policy is unspecified. |
| Single-work station ring | `.metro-station-core` and center dot | `exists` | Restyle to the dark fill, colored 3.5px ring reference. |
| Vertical multi-trajectory interchange | `.metro-interchange-ring` is circular | `needs visual rewrite` | Use dark knockout plus pale vertical capsule. |
| Rounded aggregate station | `.metro-aggregate-ring` is circular with numeric center | `needs visual rewrite` | Use a colored rounded outline and count in the work metadata. |
| Aggregate child expansion | `expandedHierarchyParentIds` and inspector Show/Collapse actions | `needs visual rewrite` | Keep semantic behavior; expanded visual state is not pictured. |
| Dashed directional explicit relations | `.metro-explicit-layer`, `.metro-relation-visible`, arrow marker | `exists` | Align amber dash/arrow styling and layer above continuity. |
| Explicit relation type label on canvas | Relation count only for grouped relations | `missing` | Add compact amber labels; the reference labels 2 of 6 paths and does not specify the selection rule. |
| Selected work glow and year guide | Selection classes and bucket emphasis exist | `needs visual rewrite` | Match the coordinated white glow/capsule/year treatment without changing line width. |
| Selected work label slab | Canvas work annotations are absent | `missing` | Add the low-opacity backing plate together with the selected work annotation. |
| Bottom trajectory token strip | No persistent equivalent | `missing` | Seven color/count tokens plus dashed hidden-count token. |
| Bottom symbol legend | `.metro-copy-legend` inside “How to read this view” | `needs visual rewrite` | Persistent second legend row with five glyph meanings. |
| 304px pinned work inspector | `aside.metro-details` variants in [`EvolutionView`](../../../src/views/EvolutionView.tsx) | `needs visual rewrite` | Fixed shell with compact header and stacked 14px sections. |
| Inspector collapse | `inspectorOpen` and `.metro-inspector-controls` | `needs visual rewrite` | Move the existing affordance into the inspector header; collapsed geometry remains unspecified. |
| Inspector work ID and close | No equivalent ID/close header | `missing` | Preserve canonical ID legibility at 304px. |
| Work title and compact metadata | Partial title/date metadata in the station inspector; fuller fields in [`WorkEntityBody`](../../../src/components/EntityWindowBody.tsx) | `needs visual rewrite` | Compose title, date, kind, country, and language into the compact inspector header. |
| 16:10 inspector media surface | [`EntityImageCarousel`](../../../src/components/ImageCarousel.tsx) exists only in floating entity windows | `missing` | Add the fixed-aspect inspector slot; do not treat the separate floating window as visual correspondence. |
| Interchange trajectory rows with strength/type/role | Selected-station tag groups and strength profiles | `needs visual rewrite` | Compact four-column rows with colored variable-thickness swatches. |
| “Continuity ≠ influence” station callout | Meaning exists only in general introduction/about copy | `missing` | Add the compact semantic callout shown in the inspector. |
| Documented relation cards | Plain explicit-relation lists in the station inspector | `needs visual rewrite` | Stack incoming/outgoing cards with type, work, and source line. |
| Relation evidence/source line | Current `WorkRelation` model exposes endpoints/type only | `missing` | Do not invent evidence copy; the current Viewer model has no relation-linked evidence. |
| From-here Earlier/Later actions | No station-relative traversal actions | `missing` | Two primary actions; exact traversal interaction must follow permanent semantics. |
| Set as focus | Station selection already establishes persistent focus | `needs visual rewrite` | Expose the existing focus transition as the reference action. |
| Work pinning | Tag pinning exists; work pinning does not | `missing` | Add only when the rail's mixed pinned-entity model exists. |
| Nearby aggregates summary | No current equivalent | `missing` | Derive from visible hierarchy context without inventing graph facts. |
| Hover tooltip | Local `Tooltip`, [`evolution-hover.ts`](../../../src/lib/evolution-hover.ts), interaction lookup | `exists` | Tooltip geometry is not specified by the images. |
| Preview de-emphasis, persistent selection, keyboard focus | Interaction classes and `:focus-visible` styling in [`enhancements.css`](../../../src/enhancements.css) | `exists` | Retain non-semantic emphasis; do not alter trajectory width. |
| Bundle collapsed/expanded presentation | Automatic bundles plus inspector expansion action | `needs visual rewrite` | Image shows only `Bundling on`; bundle-specific expanded pixels are unspecified. |
