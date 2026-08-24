import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "dist");
const json = async (relative) => JSON.parse(await readFile(join(dist, relative), "utf8"));
const active = await json("data/active.json");
const api = await json("api/v1/index.json");
const openapi = await json("api/v1/openapi.json");

if (active.format !== "arachne_demo_active_v1") throw new Error("invalid active manifest");
if (api.format !== "arachne_demo_api_v1") throw new Error("invalid API index");
if (api.productSha256 !== active.productSha256) throw new Error("API/data identity mismatch");
if (api.sourceDataCommit !== active.sourceDataCommit) throw new Error("source commit mismatch");
if (!api.resources.database.endsWith(active.database.file)) throw new Error("database URL is not immutable");
if (openapi.openapi !== "3.1.0") throw new Error("invalid OpenAPI descriptor");

for (const name of ["browse", "evolution", "taste", "research", "recommendations", "islands"]) {
  const view = await json(`api/v1/views/${name}.json`);
  if (view.id !== name || view.productSnapshotId !== active.productSnapshotId) {
    throw new Error(`invalid ${name} descriptor`);
  }
  if (view.interactive !== `/arachne-demo/?view=${name}`) {
    throw new Error(`invalid ${name} interactive route`);
  }
  if (!(await stat(join(dist, name, "index.html"))).isFile()) {
    throw new Error(`missing ${name} HTML route`);
  }
  const route = await readFile(join(dist, name, "index.html"), "utf8");
  if (!route.includes(`href=\"/arachne-demo/?view=${name}\"`)) {
    throw new Error(`${name} static route does not open its interactive view`);
  }
}

if (JSON.stringify(api).includes(`catalog${".json"}`)) {
  throw new Error("legacy giant catalog is still published");
}
console.log("Static manifest/API checks passed");
