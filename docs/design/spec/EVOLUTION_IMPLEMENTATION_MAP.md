# Evolution implementation map

This is the post-pass correspondence map for the primary Evolution image.
`missing` records a pictured component that remains intentionally omitted; it
does not create a product commitment where behavior or data is undefined.

| Visible design component | Current React/module | Status | Current correspondence |
|---|---|---|---|
| Three-column desktop shell | [`App`](../../../src/App.tsx), `.app`, `.metro-workspace` | `exists` | Persistent 200px rail, dominant workspace, and 304px in-shell inspector. |
| Navigation rail | `App` `.navigation-rail` | `exists` | Dark full-height rail with brand, snapshot metadata, vertical navigation, Labs, Research callout, and API link. |
| Brand and corpus summary | `App` `.brand` | `exists` | Snapshot ID plus live work and tag-assignment totals use the compact two-line treatment. |
| Evolution/Browse/Research/Taste navigation | `App` `VIEWS`, `.view-tabs` | `exists` | Reference ordering, active row surface, and available live counts. |
| Pinned entities | No persistent mixed-entity rail model | `missing` | Omitted; local tag pinning is not equivalent to the pictured work/tag section. |
| Saved views | No current state/component | `missing` | Omitted because Saved Views behavior is undefined. |
| Research queue callout | `App` `.research-queue-callout` | `exists` | Uses the live unresolved-problem count and existing Research navigation. |
| Seed command bar | [`EvolutionControls`](../../../src/components/EvolutionControls.tsx) | `exists` | Horizontal 67px command row replaces the former sticky control column. |
| Colored removable seeds and add trajectory field | [`TagPicker`](../../../src/components/TagPicker.tsx) | `exists` | Data-colored tokens and searchable dashed add field retain the existing seed behavior. |
| Earlier/Later controls | `EvolutionControls` `.evolution-depth-stepper` | `exists` | Independent segmented steppers preserve the existing traversal depths. |
| Filter control | `EvolutionControls` `.evolution-filter-menu` | `exists` | Compact badge/trigger with the existing exclusion, date, taste, and expansion controls in its disclosure. |
| Visibility ratio | `EvolutionControls` `.evolution-visibility-control` | `exists` | Shows actual visible/eligible trajectory counts and retains limit stepping. |
| Bundling control | Automatic projection in [`evolution-trajectory-projection.ts`](../../../src/lib/evolution-trajectory-projection.ts) | `missing` | Bundling remains automatic; no unsupported on/off control is shown. |
| Scene status and chronology note | [`EvolutionSceneStatus`](../../../src/components/EvolutionChrome.tsx) | `exists` | Compact 57px row with live counts, chronological-order note, context, and real warnings. |
| Detail selector | Per-aggregate expansion only | `unclear` | The pictured global Detail behavior remains undefined and is omitted. |
| Zoom and reset | `EvolutionControls` `.evolution-view-command-bar__actions` | `exists` | Existing zoom and reset behavior use the compact second-row treatment. |
| Fit action | No current fit-to-viewport action | `missing` | Omitted rather than represented by an inert behavioral control. |
| Dominant Evolution canvas | [`EvolutionView`](../../../src/views/EvolutionView.tsx) `.metro-chart-shell`, `.metro-canvas` | `exists` | Occupies the full center region between status and legend; existing scroll/zoom remains intact. |
| Year axis and chronological grid | `EvolutionView` `.metro-axis-layer` | `exists` | Sparse mono year labels, full plot guides, axis rule, selected year emphasis, and top-aligned SVG scene. |
| Compressed-gap ellipsis | Existing compressed temporal layout | `missing` | Compression is present, but the reference's dedicated ellipsis glyph is not rendered. |
| Variable-width trajectories | Existing SVG trajectory projection and strength segments | `exists` | Rounded colored paths keep semantic width independent of hover and selection. |
| Inline trajectory labels | `EvolutionView` `.metro-tag-label` | `exists` | Uppercase-style name plus concept type, bundle role, and seed role. |
| Open plus terminals | No endpoint glyph | `missing` | Existing direction cues remain; no endpoint behavior was inferred from the mockup. |
| Work annotations | `EvolutionView` `.metro-work-label-layer` | `exists` | Collision-filtered title and date/kind/credit metadata use start/end anchors. |
| Single-work station | `EvolutionView` `.metro-single-station-ring` | `exists` | Dark hollow center with a trajectory-colored 3.5px ring. |
| Interchange | `EvolutionView` `.metro-interchange-cap` | `exists` | Atomic multi-trajectory works use the pale vertical capsule grammar. |
| Aggregate station | `EvolutionView` `.metro-aggregate-glyph` | `exists` | Colored rounded outline; represented-work count remains in annotation/inspector data rather than the glyph. |
| Aggregate expansion | Existing `expandedHierarchyParentIds` behavior | `exists` | Existing Show/Collapse behavior is retained; the reference depicts only the collapsed glyph. |
| Explicit relations | `EvolutionView` `.metro-explicit-layer` | `exists` | Amber dashed directional paths remain separate from continuity and render above trajectories. |
| Relation type labels on canvas | No label-selection rule | `missing` | Relation types remain available in the inspector without inventing which paths receive canvas labels. |
| Selected work treatment | `EvolutionView` station selection classes and selected temporal bucket | `exists` | White station treatment, soft glow, emphasized year, and persistent inspector selection. |
| Selected label slab | `EvolutionView` `.metro-work-label-backdrop` | `exists` | Low-opacity rounded backing appears only for the selected annotated work. |
| Trajectory token strip | [`EvolutionLegend`](../../../src/components/EvolutionChrome.tsx) | `exists` | Persistent data-driven visible tokens, seed/selection variants, counts, and hidden count. |
| Symbol legend | `EvolutionLegend` `.evolution-symbol-legend` | `exists` | Persistent station, interchange, aggregate, documented-relation, and width keys. |
| Inspector shell | `EvolutionView` `.metro-details` | `exists` | Fixed 304px surface with 32px header and independently scrolling compact content. |
| Inspector collapse, identity, and clear | `.metro-details-header` | `exists` | Existing collapse behavior moved into the header with canonical selection identity and clear action. |
| Work title and metadata | Station inspector branch in `EvolutionView` | `exists` | Compact title, date quality, reach, membership, hierarchy, and relation data reuse existing logic. |
| Inspector media surface | [`EntityImageCarousel`](../../../src/components/ImageCarousel.tsx) only in floating records | `missing` | No placeholder or media behavior was invented for Evolution. |
| Interchange membership rows | Existing visible-tag and strength sections | `needs visual rewrite` | Complete data is present, but the reference's compact four-column row composition is not yet exact. |
| Continuity ≠ influence callout | `EvolutionView` `.metro-continuity-callout` | `exists` | Shown only for a real interchange and keeps continuity distinct from causality. |
| Documented relation cards | `EvolutionView` `.metro-relation-cards` | `exists` | Station-linked relation type and endpoints use the warm outlined card treatment. |
| Relation evidence/source line | Current `WorkRelation` model exposes no linked evidence | `missing` | No source copy is fabricated. |
| From-here traversal actions | No station-relative traversal action | `missing` | Existing global Earlier/Later traversal is unchanged. |
| Set as focus | Existing persistent station selection | `exists` | Clicking a station already establishes focus; no duplicate inspector action is added. |
| Work pinning | Tag pinning only | `missing` | Omitted because no persistent work-pin model exists. |
| Nearby aggregates note | No current equivalent | `missing` | Omitted rather than deriving an unsupported summary. |
| Hover, focus, and de-emphasis | [`evolution-hover.ts`](../../../src/lib/evolution-hover.ts), interaction classes, `.metro-hover-tooltip` | `exists` | Existing preview, persistent focus, keyboard focus, and semantic-width rules are retained. |
| Bundle presentation | Existing automatic bundle projection and inspector expansion | `needs visual rewrite` | Functional bundle selection/expansion remains; the image does not define an expanded visual variant. |
