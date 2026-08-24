import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "dist");
const baseUrl = normalizeBase(process.env.ARACHNE_DEMO_BASE ?? "/arachne-demo/");
const active = JSON.parse(await readFile(join(dist, "data", "active.json"), "utf8"));

if (
  active.format !== "arachne_demo_active_v1" ||
  active.formatVersion !== 1 ||
  typeof active.productSha256 !== "string" ||
  active.database?.file !== `product-${active.productSha256}.sqlite`
) {
  throw new Error("dist/data/active.json is absent or incompatible");
}

function normalizeBase(value) {
  const leading = value.startsWith("/") ? value : `/${value}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
}

async function json(relative, value) {
  const path = join(dist, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function route(name, descriptor) {
  const path = join(dist, name, "index.html");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(descriptor.title)} · Arachne</title></head>
<body><main><h1>${escapeHtml(descriptor.title)}</h1><p>${escapeHtml(descriptor.description)}</p>
<p><a href="${escapeHtml(`${baseUrl}?view=${name}`)}">Open the interactive view</a></p>
<p><a href="${escapeHtml(`${baseUrl}api/v1/views/${name}.json`)}">Read its JSON descriptor</a></p>
<script type="application/json" id="arachne-view">${JSON.stringify(descriptor).replaceAll("<", "\\u003c")}</script>
</main></body></html>\n`,
    "utf8",
  );
}

const views = {
  browse: {
    id: "browse",
    title: "Browse",
    description: "Search and inspect works and agents in the pinned product read model.",
  },
  evolution: {
    id: "evolution",
    title: "Evolution",
    description: "Explore historical continuity and explicit relations in the pinned state.",
  },
  taste: {
    id: "taste",
    title: "Taste",
    description: "Use a native taste projection when the pinned state publishes one.",
  },
  research: {
    id: "research",
    title: "Research",
    description: "Inspect a native research projection when the pinned state publishes one.",
  },
  recommendations: {
    id: "recommendations",
    title: "Recommendations",
    description: "Explore local recommendations over the pinned product state.",
  },
  islands: {
    id: "islands",
    title: "Islands",
    description: "Explore feature islands when a matching native taste projection is available.",
  },
};

const resources = {
  active: `${baseUrl}data/active.json`,
  database: `${baseUrl}data/${active.database.file}`,
  fallback: `${baseUrl}data/${active.fallback.file}`,
  ...(active.derived?.research
    ? { research: `${baseUrl}data/${active.derived.research}` }
    : {}),
  ...(active.derived?.taste
    ? { tasteIndex: `${baseUrl}data/${active.derived.taste}` }
    : {}),
  ...(active.derived?.imageHints
    ? { imageHints: `${baseUrl}data/${active.derived.imageHints}` }
    : {}),
};

await json("api/v1/index.json", {
  format: "arachne_demo_api_v1",
  formatVersion: 1,
  productSnapshotId: active.productSnapshotId,
  productSha256: active.productSha256,
  schemaIdentity: active.schemaIdentity,
  sourceDataCommit: active.sourceDataCommit,
  resources,
  views: Object.fromEntries(
    Object.keys(views).map((name) => [name, `${baseUrl}api/v1/views/${name}.json`]),
  ),
});

await json("api/v1/openapi.json", {
  openapi: "3.1.0",
  info: { title: "Arachne Demo static API", version: "1" },
  servers: [{ url: baseUrl }],
  paths: {
    "/data/active.json": {
      get: {
        summary: "Resolve the active immutable product database and fallback shards",
        responses: { 200: { description: "Pinned publication manifest" } },
      },
    },
    "/api/v1/index.json": {
      get: {
        summary: "Read the static service index",
        responses: { 200: { description: "Static service index" } },
      },
    },
  },
});

for (const [name, descriptor] of Object.entries(views)) {
  const value = {
    format: "arachne_demo_view_v1",
    formatVersion: 1,
    ...descriptor,
    productSnapshotId: active.productSnapshotId,
    data: resources.active,
    interactive: `${baseUrl}?view=${name}`,
  };
  await json(`api/v1/views/${name}.json`, value);
  await route(name, value);
}

console.log(`Built manifest-first static API for ${active.productSnapshotId}`);
