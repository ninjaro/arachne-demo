# Arachne Demo

This repository is the public React/static presentation for Arachne. It is a
read-only consumer: schemas, ingestion, identity, graph, research, and taste
semantics belong to [`ninjaro/arachne`](https://github.com/ninjaro/arachne),
while authoritative reviewed state lives in the private
`ninjaro/arachne-data` repository.

The `data/` gitlink pins one known-good Arachne data commit. Production never
builds from “latest”; CI resolves that exact gitlink, checks out the private
repository with a read-only credential, pulls LFS, and publishes only the
selected snapshot. Renovate normally advances the gitlink weekly through the
same grouped maintenance branch as npm and Actions updates.

## Local layout

```text
~/Projects/art/arachne       C++ code, schemas, ingestion, canonical writer
~/Projects/art/arachne-data  private authoritative state
~/Projects/art/arachne-demo  this viewer and pinned read-only dependency
```

For ordinary development, reuse the sibling data checkout:

```sh
git submodule update --init data            # only when testing the pinned state
npm ci
ARACHNE_DATA_ROOT=../arachne-data npm run data
npm run dev
```

`ARACHNE_DATA_ROOT` must identify an Arachne state repository containing
`state-manifest.json` and the canonical database, with both identity-bearing
paths tracked and clean at its current Git `HEAD`. Omit it to use the pinned
`data/` submodule. The publication script rejects a mislabeled/dirty checkout,
database hash, schema identity, or supplied native projection that does not
agree with those controls.

## Browser data path

`npm run data` creates ignored, disposable delivery files under `public/data/`:

```text
active.json
product-<full-product-sha256>.sqlite
fallback/product-<product-sha256>/manifest-<content-sha256>.json
fallback/product-<product-sha256>/tables/<table>/<chunk-content-sha256>.json
derived/research-<content-sha256>.json             # transient native output
derived/taste-index-<content-sha256>.json           # transient native output
derived/wikidata-image-hints-<content-sha256>.json  # optional reviewed artifact
```

Immutable SQLite, shard, manifest, and derived-artifact URLs prevent browser
caches from mixing bytes across releases. `active.json` binds them to the product hash,
schema identity, exact `arachne-data` commit, and exact native product snapshot.
The browser probes a one-byte range request. A reliable `206` response uses
SQLite WASM in a Worker through an HTTP range VFS; hosts that ignore or fake
Range automatically use hashed static table shards. Targeted work/agent/detail
queries use shard keys or parameterized SQL rather than hydrating unrelated
records. Plain-text Browse searches also use the adapter's bounded name query
to preserve alias matches without a database-wide name-table hydration on the
SQLite path. Graph-heavy views may materialize the complete current presentation
projection, but there is no committed monolithic JSON catalog mirror.

The single Python build script performs presentation publication and generic
sharding only. It never derives research scores, taste weights, graph identity,
or canonical product values. Production checks out the exact Arachne producer
commit recorded by the pinned state manifest, exports a temporary identity-bound
read stream, and invokes native `product research` and `product taste-index` in
runner temporary storage. The hash-bound results are passed to the publication
script and never committed to either code or state repository. Missing native
artifacts produce a clear unavailable state rather than a JavaScript/Python
reimplementation. The browser can apply private local ratings to native sparse
vectors for presentation, but it never derives replacement work features or
corpus weights from product rows; a missing native vector yields no inferred
signal.

## Commands

```sh
npm test                 # viewer and data-adapter fixture tests
npm run test:publisher  # immutable publication tests with a tiny SQLite fixture
npm run build:assets    # type-check and Vite build, no product checkout needed
npm run data            # publish from pinned data/ (or ARACHNE_DATA_ROOT)
npm run build           # verify publication, then build assets and static API
npm run test:static     # verify the generated static API and routes
npm run verify          # complete local verification against selected data
```

The static API begins at `api/v1/index.json` and links to `data/active.json`,
the immutable database, fallback manifest, available native projections, and
view descriptors. Published SQLite and shards are public snapshot bytes even
though the source state repository and its history remain private.

## Credentials and deployment

Pages CI uses only `ARACHNE_DATA_READ_TOKEN`, scoped to read the private data
repository and its LFS objects. It is distinct from Renovate’s read identity
and from Arachne’s canonical writer GitHub App. No data-writer credential is
available to this repository, PR jobs, browser bundles, or deployment jobs.

The Pages workflow uploads and deploys only after all checks and the static
build succeed. A failed viewer/data build performs no deployment, leaving the
previous Pages release valid. Repository settings should disable Dependabot
version and security-update PR creation; Renovate is the sole update writer,
while GitHub security alerts may remain enabled.

See [repository boundaries](docs/REPOSITORY_BOUNDARIES.md) and the preserved
[Redesign materials](docs/design/README.md).
