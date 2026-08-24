# Arachne Viewer design specification

This package normalizes the preserved Viewer references into design units and
reusable component sets. It is an implementation input, not production UI.

## Source authority

| Priority | Source | Native export | Design frame | Use |
|---:|---|---:|---:|---|
| 1 | [`3a-evolution.png`](../3a-evolution.png) | 3704 × 1814 | 1852 × 907 | Authoritative Evolution composition and rendered state |
| 1 | [`3b-browse.png`](../3b-browse.png) | 3704 × 1024 | 1852 × 512 | Authoritative shared shell and Browse variant |
| 2 | [`Arachne Viewer - Redesign.dc.html`](../Arachne%20Viewer%20-%20Redesign.dc.html) | design-tool source | 1852px final frames | Exact inline measurements, colors, type, and generated geometry |
| 3 | [`EVOLUTION.md`](../EVOLUTION.md) | normative document | n/a | Durable design rules when a mockup is ambiguous |

The PNGs are exact 2× exports of HTML frames `3a` and `3b`, but remain primary.
The HTML depends on missing `support.js`, custom `x-dc`/`sc-for` elements, and
remote Google Fonts, so it is not a complete standalone artifact. Its older
Turn 1/2 frames are historical explorations, not responsive variants of the
final design.

## Figma-like frame hierarchy

```text
Page / Viewer redesign
├─ Frame / Evolution / Desktop dense                    1852 × 907
│  ├─ Component / Navigation rail                       200 × 907
│  │  ├─ Brand + snapshot summary
│  │  ├─ Primary navigation / active=Evolution
│  │  ├─ Pinned entities
│  │  ├─ Saved views
│  │  └─ Research queue callout
│  ├─ Frame / Evolution workspace                       1348 × 907
│  │  ├─ Component / Evolution command bar              1348 × 67
│  │  ├─ Component / Scene status bar                   1348 × 57
│  │  ├─ Frame / Evolution canvas                       1348 × 700
│  │  │  ├─ Time axis and grid
│  │  │  ├─ Trajectory layer
│  │  │  ├─ Explicit-relation overlay
│  │  │  ├─ Station/interchange/aggregate layer
│  │  │  ├─ Work and trajectory labels
│  │  │  └─ Selection overlays
│  │  └─ Component / Trajectory and symbol legend       1348 × 83
│  └─ Component / Inspector / work                      304 × 907
└─ Frame / Browse / Desktop dense                       1852 × 512
   ├─ Component / Navigation rail                       200 × 512
   ├─ Frame / Browse workspace                          1348 × 512
   │  ├─ Component / Browse command bar                 1348 × 52
   │  ├─ Component / Result status bar                  1348 × 42
   │  ├─ Component / Work table header                  1348 × 29
   │  ├─ Component set / Work row / 10 instances        1348 × 35 each
   │  └─ Component / Result footer                      1348 × 35
   └─ Component / Inspector / selection set             304 × 512
```

Exact coordinates and responsive evidence are in [`frames.json`](frames.json).
Reusable anatomy, instance counts, variants, and state evidence are in
[`components.json`](components.json). [`tokens.css`](tokens.css) is a reference
token vocabulary and is deliberately not imported by production CSS.

## Source comparison and unresolved details

| Observation | Normalized decision |
|---|---|
| Every component visible in the two PNGs has a corresponding element or generated template in final HTML frames `3a`/`3b`. | There is no confirmed image-only component. The screenshot remains authoritative because the missing design runtime prevents the HTML alone from materializing its repeated graph/table instances. |
| HTML headings and Turn labels surround the frames but are absent from the PNGs. | They are design-tool annotations, not Viewer components. |
| Evolution reports `3 aggregates`, and the inspector names Akira, Cowboy Bebop, and The Animatrix, but only two aggregate glyphs are rendered. The Animatrix uses the vertical interchange grammar. | Keep the count/glyph conflict explicit. Do not invent the third glyph or classify The Animatrix as an atomic interchange without direct multi-tag assignments. Durable semantics forbid aggregation alone from creating an interchange. |
| `work-091844` wraps at the inspector's 304px width. | Record it as observed wrapping, not a desired invariant; IDs must remain legible without widening the inspector over the canvas. |
| Final frames are fixed desktop compositions. No breakpoint, narrow toolbar, collapsed inspector, or mobile rail appears. | Preserve the baseline geometry. Below it, exact breakpoints and collapsed dimensions remain unspecified. The canvas has spatial priority and the inspector may collapse, per durable design rules. |
| Turn 2 renames Evolution as “Threads” and describes lines as suggested groupings. | Superseded. Use the final trajectory/station/interchange vocabulary and historical-continuity semantics. |
| Turn 1/2 use light editorial layouts, metric-looking time, and different inspector widths. | Historical only; do not merge their tokens or geometry into the final dark Atlas frame. |

### Components visible in images but absent from HTML

No confirmed image-only component remains after comparing both final frames
element by element. The graph marks, repeated inspector rows, and Browse rows
are represented by `sc-for` templates plus embedded data, rather than literal
expanded DOM. They disappear when the HTML is opened without its missing design
runtime, which is why the images—not the apparent standalone HTML output—remain
the completeness check.

## Historical HTML-only frames

The HTML also contains three earlier 1400px explorations. They were inspected
for provenance but intentionally excluded from active components and tokens.

| Frame | Composition and distinct inventory | Disposition |
|---|---|---|
| `2a` · Threads | Light editorial header/nav/search; starting-idea, reach, line-budget, and Refine controls; SVG lineage timeline; 372px selected-work inspector; uncertainty/relation legends and warning cards | Superseded vocabulary, time treatment, and shell; no active variants imported |
| `1a` · Reading Room | Light Newsreader-led header; sentence filters; four-column poster grid; 392px detail inspector with taste, recommendation, concepts, credits, and lineage strip | Historical gallery direction only |
| `1b` · Atlas | Dark 196px rail; command/filter bar and Save view; dense work table; taste cells; 372px media/detail inspector with a small lineage lens | Visual ancestor of Turn 3, but final PNG geometry and components take precedence |

## State evidence

The references show active navigation, seeded trajectory tokens, selected and
unselected Browse rows, an expanded inspector, collapsed aggregate stations,
and one selected Evolution work. That selected work combines a low-opacity
white glow, white interchange capsule, label backing plate, bold year, temporal
guide, and populated inspector. Selection never changes trajectory width.

Hover, disabled controls, a focus state distinct from selection, a collapsed
inspector, expanded aggregate children, open filter/popover states, and tooltip
geometry are not pictured. Durable behavior permits hover preview and keyboard
focus without changing semantic width, but the references do not supply a pixel
spec for those states. No modal, minimap, tooltip, or free-floating pan/zoom
control is visible; the view controls are integrated into the two toolbars.

## Reference frame

[`EVOLUTION_FRAME.svg`](EVOLUTION_FRAME.svg) is a schematic annotation of the
authoritative frame and layer order. It is intentionally not a visual remake.
The final handoff to implementation is
[`EVOLUTION_IMPLEMENTATION_MAP.md`](EVOLUTION_IMPLEMENTATION_MAP.md).
