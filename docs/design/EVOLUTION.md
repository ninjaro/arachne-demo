# Evolution visual design

Evolution is the Viewer's primary product surface. Browse, Research, Taste,
entity detail, and the static API support it rather than competing for the main
canvas. The semantic contract is defined in
[Evolution semantics](../reference/EVOLUTION_SEMANTICS.md).

## Workspace

The default shell is a compact three-column analytical workspace: a persistent
left navigation and seed rail, a dominant central Evolution canvas, and a
narrow collapsible inspector. Earlier and Later remain separate, prominent
controls; connected mode, date quality, taste, and visibility limits belong in
compact advanced controls. The graph keeps spatial priority when the inspector
opens.

The visual language is dark, dense, and typographically clear. Controls stay
compact, selected states remain legible, and the screen does not become a
dashboard of oversized cards.

## Graph grammar

The graph uses one small vocabulary: trajectory line, atomic work station,
atomic interchange, derived aggregate station, and directional explicit-
relation overlay. Historical continuity reads as a flowing route; explicit
relations use a distinct dashed or directional treatment and sit above the
continuity layer.

Aggregates use the same station grammar as works, with concise domain labels
such as `10 tracks` or `12 episodes`. Their children and provenance belong in
the inspector or a local expansion, not nested boxes. Work hierarchy is never
rendered as a tree merely because containment data exists.

Line width retains its semantic meaning of tag significance. Hover, selection,
focus, and unrelated context use contrast, opacity, glow, labels, or detail;
they do not change width. Wide invisible hit paths may support pointer and
keyboard access without changing visible geometry.

## Interaction and continuity

Hover previews context; click establishes persistent focus for a trajectory,
station, aggregate, bundle, or explicit relation. The inspector reports exact
atomic identities and relation endpoints. Expansion and collapse preserve the
same reachable set and, where possible, keep the user's local anchor and lane
context stable.

Time labels adapt to density and date precision without suggesting metric
duration. Uncertainty is communicated lightly rather than as large range
objects. Bundling and de-emphasis reduce clutter while keeping the selected
historical path readable.

Published views use real snapshot data. Neutral synthetic examples are clearly
identified as fixtures and never masquerade as historical evidence.
