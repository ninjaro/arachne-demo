# Arachne Evolution — remaining frontend work

Evolution is a static historical lineage viewer. Atomic work traversal, work hierarchy aggregation, explicit-relation overlays, scale-aware strength, tapered trajectories, adaptive time layout, trajectory selection/bundling, and the three-column shell are implemented.

## Projection interaction

- Retain the previous aggregate anchor as closely as possible when locally expanding or collapsing children; the atomic Earlier/Later reach set must stay unchanged.

## View decomposition

- Extract the SVG canvas/render layers from `EvolutionView.tsx`; keep traversal, hierarchy, aggregation, and layout in pure library modules.
- Extract the inspector presentation into a component with small tag, bundle, station, and relation sections. Keep selection/projection state in the view-level hook.
