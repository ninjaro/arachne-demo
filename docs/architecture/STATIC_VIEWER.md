# Static viewer architecture

This document applies the [repository ownership rules](REPOSITORY_BOUNDARIES.md)
to the Viewer. The product meaning of its graph is defined separately in
[Evolution semantics](../reference/EVOLUTION_SEMANTICS.md).

## Authority and delivery

The Viewer is a read-only consumer of an immutable, identity-bound product
snapshot. The browser may filter, traverse, rank, aggregate, route, and lay out
that snapshot, but it has no product write path. A future query service may
improve read access; it does not become a canonical writer or the authority for
an SVG scene.

Release identity and fail-closed compatibility follow the repository ownership
rules above. Operational paths and commands live in the root
[README](../../README.md), rather than being repeated here.

## Canonical read model

The read adapter exposes the smallest canonical surface needed by the Viewer:
works and accepted dates; concept assignments with their raw centrality values
and scales; work memberships; agents and credits; agent relations; explicit
work relations; and their evidence. Labels and parent/child views derive from
those records.
`work_memberships` is the only work-hierarchy source; there is no parallel
Evolution hierarchy contract.

The static API describes canonical records, evidence, immutable artifacts, and
view entry points. Layout coordinates, SVG paths, rendered stations, and scene
state are not API facts. Targeted reads and immutable shards may change delivery
costs, while an in-memory graph projection remains disposable and no committed
catalog mirror becomes a second product model.

## Projection boundary

The stable stage order is:

```text
immutable adapter
  -> atomic work/tag/date index
  -> filters, seeds, and atomic Earlier/Later traversal
  -> reachable-to-visible ranking
  -> hierarchy aggregation and aggregate profiles
  -> trajectory projection and bundling
  -> DAG layout and edge routing
  -> SVG presentation
```

Traversal precedes aggregation so collapse cannot change atomic reachability or
provenance. DAG layout follows the
[hidden-root semantic rule](../reference/EVOLUTION_SEMANTICS.md#historical-succession).
Explicit work relations are routed as a separate overlay and never become
ordinary trajectory edges.

React owns interaction state and stage assembly. Chronology, traversal,
hierarchy, aggregation, trajectory projection, and layout remain pure library
logic so the same inputs and policy produce the same scene independently of a
component lifecycle.

## Derived state

Succession edges, reach paths, similarity scores, homogeneity and outlier
scores, collapse decisions, aggregate profiles, display strengths, rankings,
bundles, coordinates, and routes are viewer projections. They are not written
to canonical SQLite, do not rewrite raw centrality, and do not become inferred
assignments or relations. Exact thresholds and display formulas are replaceable
policy rather than schema semantics.
