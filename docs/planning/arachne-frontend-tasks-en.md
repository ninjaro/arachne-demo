# Arachne Evolution — remaining frontend work

This mutable, non-normative queue is governed by the permanent
[Evolution semantics](../reference/EVOLUTION_SEMANTICS.md) and
[static viewer architecture](../architecture/STATIC_VIEWER.md).

## Projection interaction

- Retain the previous aggregate anchor as closely as possible when locally expanding or collapsing children; the atomic Earlier/Later reach set must stay unchanged.

## View decomposition

- Extract the SVG canvas/render layers from `EvolutionView.tsx`; keep traversal, hierarchy, aggregation, and layout in pure library modules.
- Extract the inspector presentation into a component with small tag, bundle, station, and relation sections. Keep selection/projection state in the view-level hook.
