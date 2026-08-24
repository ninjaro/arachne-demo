# Evolution semantics

Evolution is a TimeNets-inspired historical lineage view over canonical works,
concept assignments, work hierarchy, and explicit relations. This document is
the normative meaning of the projection, independent of React components or a
particular layout algorithm.

## Vocabulary

| Term | Meaning |
|---|---|
| work | The primary atomic cultural unit in Evolution. A manifestation remains a distinct edition or release record. |
| tag | A concept assigned to a work; current trajectories use concept tags such as genre, style, movement, theme, technique, or motif. |
| trajectory | Historical continuity for one membership family over works. The model permits other families, such as agents, without conflating them with concepts. |
| station | One atomic work or a derived aggregate representing known child works. |
| interchange | One atomic work with two or more visible trajectory memberships. |
| explicit relation | A canonical, evidence-backed directed relation between exact works. It is not ordinary trajectory continuity. |

## Historical succession

Trajectory continuity is derived from shared tag membership over time. For each
tag on a work, that work connects to every work at the nearest strictly later
date carrying the same tag. A tie at the nearest date retains every tied target.
Tag-specific successors with the same ordered work pair collapse to one edge
that retains the full shared-tag set that generated that pair.

This continuity means historical succession only. It does not assert influence,
descent, causality, adaptation, or authorship. Similarity scores, thresholds,
rankings, and inferred-parent selection do not create lineage edges.

Explicit work relations create direct edges between their exact endpoints,
without similarity calculations or inferred parent selection. They remain a
separate directional overlay and take visual precedence over tag-derived
continuity. They may contradict chronology or form cycles without changing the
historical DAG or ordinary traversal.

Disconnected historical components share a hidden virtual root only while the
layout is computed. That root is not a work, cannot be selected or traversed,
and is never rendered.

## Time

Each work is one atomic point at its earliest accepted date. Later or end date
values may refine or qualify that date but never create another point, a span,
or duration geometry. View filters may omit a work; they do not split it.

Horizontal position preserves chronology but is not metric elapsed time. Dense
years may widen, empty historical gaps may compress, and exact dates constrain
ordering more strongly than tied or incomplete dates. Valid ties and incomplete
dates give the layout freedom to reduce crossings and bends. A hierarchy
membership position is a sibling-order hint under temporal ambiguity, never a
timestamp. A multi-year aggregate has a representative anchor, not a duration
bar, and its atomic dates remain recoverable.

## Atomic traversal

Earlier and Later are independent traversal budgets. Moving from a work to the
neighboring temporal group for the active tag consumes one step in the matching
direction. Switching tags at the same atomic interchange costs no temporal
step. Directional and connected exploration may choose different paths, but
both preserve the two costs independently.

Traversal runs on atomic works before aggregation. Collapse and expansion
therefore describe the same underlying reachable graph for the same seeds and
filters, and every explanation retains its atomic works and path. Explicit
relation edges are inspectable context, not ordinary Earlier/Later traversal
edges. A visual aggregate that contains tag X on one child and tag Y on another
does not create free X-to-Y switching.

Reachable and rendered are distinct. Ranking, caps, focus, pinning, bundling,
and semantic zoom decide presentation, not product truth or reachability. Seed,
selected, and pinned trajectories may survive ordinary visibility caps.

## Work hierarchy and aggregation

`episode_of`, `season_of`, `track_of`, `volume_of`, `issue_of`, `chapter_of`,
`part_of`, and `collected_in` express work composition or partonomy. They guide
sibling order, locality, aggregation, and detail; they do not require a nested
tree interface. Parent presence alone never implies collapse. Semantic
homogeneity matters more than medium or date span: a coherent album or series
may collapse, while heterogeneous or focus-relevant children remain visible.

An aggregate is derived projection state, never a new canonical work. It keeps
the exact child identifiers, membership type and order, atomic dates, relation
endpoints, traversal provenance, per-tag support and coverage, known-strength
statistics, direct parent assignments, and outliers. Direct assignments to the
parent remain distinguishable from child-derived support and are never inferred
or written back. Focus-sensitive outlier extraction and manual expansion change
detail only, not facts or reach.

An explicit relation whose endpoint is inside a collapsed aggregate still
belongs to that child. The renderer may surface the child or indicate a hidden
endpoint, but must not retarget the relation to the parent.

`agent_relations.member_of` is affiliation, not work containment. Credits do
not inherit between a person and a group, affiliation never drives work
aggregation, and future agent trajectories keep people and groups distinct.

## Strength and emphasis

Trajectory width encodes only the significance or centrality of that tag at a
station. It does not encode confidence, popularity, traversal depth, child
count, selection, or hover state. Source and target strengths remain separate,
so a segment may taper between stations; selection uses contrast, opacity, or
glow without changing semantic width.

Raw centrality retains its `binary`, `ordinal`, `graded`, or `none` scale.
Values in the nominal 1–100 range are not automatically comparable across those
scales, and `none` is not silently treated as `graded`. Scale remapping is
replaceable display policy and never rewrites the source assignment.

Aggregate strength reflects both present-child strength and descendant
coverage: one strong child cannot make an entire aggregate appear equally
strong. The exact scale remap and aggregation formula are non-canonical policy.
Bundling may share geometry, but it preserves tag identities, atomic traversal,
memberships, and endpoint-strength profiles.

## Canonical and derived knowledge

Canonical facts include works, date assertions, concept assignments and their
scales, hierarchy memberships, credits and agent relations, explicit work
relations, and evidence. The Viewer may observe and project these facts, but it
does not manufacture new ones.

Historical succession, reach, collapse, aggregate support, similarity,
homogeneity, outlier scores, ranking, bundling, layout, and display strengths
are derived. Their algorithms and thresholds may evolve without a schema
migration. Synthetic data is permitted only in clearly marked fixtures or
tests; published examples never invent plausible dates, relations, credits, or
historical claims.
