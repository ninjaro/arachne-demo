# Repository boundaries

The three sibling repositories have intentionally different trust and change
lifecycles.

| Repository | Owns | Must not own |
|---|---|---|
| `arachne` | Product schema and contracts, inbox, ingestion, native domain projections, HPC, canonical writer | Canonical state checkout, React viewer, Pages deployment |
| `arachne-data` | Private latest reviewed SQLite, reviewed decisions, state controls | Application code, caches, npm output, viewer bundles, generated research/taste/JSONL |
| `arachne-demo` | React presentation, read adapter, generic static sharding, public Pages bundle | Product mutation, schema/domain semantics, data-writer credentials |

Arachne is the only writer. A demo release is reproducible because its `data/`
gitlink identifies an exact private-state commit. Demo CI may read that commit
and publish selected bytes, but cannot advance or mutate it. Local development
may point `ARACHNE_DATA_ROOT` at the sibling checkout to avoid a second LFS
checkout; initialize the submodule only when testing the exact pinned release.

Compatibility is fail-closed. `state-manifest.json`, its exact producer commit,
transient native projection identities, `data/active.json`, and the compiled
adapter schema allowlist must all agree before a site can be built.
