import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const root = resolve(process.argv[2] ?? "public/data");
const contract = JSON.parse(
  await readFile(new URL("../src/data/adapter-contract.json", import.meta.url), "utf8"),
);
const active = JSON.parse(await readFile(join(root, "active.json"), "utf8"));

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const block of createReadStream(path)) hash.update(block);
  return hash.digest("hex");
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function asset(relative) {
  if (
    typeof relative !== "string" ||
    relative.length === 0 ||
    isAbsolute(relative) ||
    normalize(relative).split(sep).some((part) => part === "..")
  ) {
    throw new Error(`invalid publication asset path: ${String(relative)}`);
  }
  const result = resolve(root, relative);
  if (result !== root && !result.startsWith(`${root}${sep}`)) {
    throw new Error(`publication asset escapes root: ${relative}`);
  }
  return result;
}

if (
  !exactKeys(contract, ["format", "adapterContract", "supportedSchemaIdentities"]) ||
  contract.format !== "arachne_demo_adapter_contract_v1" ||
  contract.adapterContract !== "arachne_product_sqlite_v1" ||
  !Array.isArray(contract.supportedSchemaIdentities) ||
  contract.supportedSchemaIdentities.length === 0 ||
  !contract.supportedSchemaIdentities.every((value) => SHA256.test(value)) ||
  !exactKeys(active, [
    "format", "formatVersion", "adapterContract", "productSnapshotId",
    "productSha256", "schemaIdentity", "sourceDataCommit", "producer",
    "database", "fallback", "derived",
  ]) ||
  active.format !== "arachne_demo_active_v1" ||
  active.formatVersion !== 1 ||
  active.adapterContract !== contract.adapterContract ||
  !SHA256.test(active.productSha256) ||
  !contract.supportedSchemaIdentities.includes(active.schemaIdentity) ||
  !COMMIT.test(active.sourceDataCommit) ||
  !exactKeys(active.producer, ["repository", "commit"]) ||
  active.producer.repository !== "ninjaro/arachne" ||
  !COMMIT.test(active.producer.commit) ||
  active.productSnapshotId !== `local-${active.productSha256.slice(0, 16)}` ||
  !exactKeys(active.database, ["file", "bytes", "pageSize"]) ||
  active.database.file !== `product-${active.productSha256}.sqlite` ||
  !Number.isSafeInteger(active.database.bytes) || active.database.bytes <= 0 ||
  !Number.isSafeInteger(active.database.pageSize) || active.database.pageSize < 512 ||
  !exactKeys(active.fallback, ["file", "sha256"]) ||
  !SHA256.test(active.fallback.sha256) ||
  active.fallback.file !==
    `fallback/product-${active.productSha256}/manifest-${active.fallback.sha256}.json` ||
  !active.derived || typeof active.derived !== "object" || Array.isArray(active.derived)
) {
  throw new Error("published active data is incompatible with this adapter");
}

const databasePath = asset(active.database.file);
const databaseStat = await stat(databasePath);
if (
  databaseStat.size !== active.database.bytes ||
  await sha256(databasePath) !== active.productSha256
) {
  throw new Error("published immutable SQLite bytes are corrupt");
}

const fallbackPath = asset(active.fallback.file);
if (await sha256(fallbackPath) !== active.fallback.sha256) {
  throw new Error("published fallback manifest is corrupt");
}
const fallback = JSON.parse(await readFile(fallbackPath, "utf8"));
if (
  !exactKeys(fallback, ["format", "formatVersion", "productSha256", "schemaIdentity", "tables"]) ||
  fallback.format !== "arachne_demo_shards_v1" ||
  fallback.formatVersion !== 1 ||
  fallback.productSha256 !== active.productSha256 ||
  fallback.schemaIdentity !== active.schemaIdentity ||
  !fallback.tables || typeof fallback.tables !== "object" || Array.isArray(fallback.tables)
) {
  throw new Error("published fallback manifest has the wrong identity");
}
for (const [table, tableContract] of Object.entries(fallback.tables)) {
  if (
    !exactKeys(tableContract, ["key", "columns", "rows", "chunks"]) ||
    !Array.isArray(tableContract.chunks)
  ) throw new Error(`invalid fallback table contract: ${table}`);
  let rows = 0;
  for (const chunk of tableContract.chunks) {
    if (
      !exactKeys(chunk, ["file", "firstKey", "lastKey", "rows", "sha256"]) ||
      !SHA256.test(chunk.sha256) ||
      !chunk.file.startsWith(`fallback/product-${active.productSha256}/tables/`) ||
      !chunk.file.endsWith(`-${chunk.sha256}.json`) ||
      !Number.isSafeInteger(chunk.rows) || chunk.rows <= 0 ||
      await sha256(asset(chunk.file)) !== chunk.sha256
    ) throw new Error(`invalid or corrupt fallback shard: ${table}`);
    rows += chunk.rows;
  }
  if (rows !== tableContract.rows) throw new Error(`fallback row count mismatch: ${table}`);
}

const derivedPrefixes = {
  research: "research",
  taste: "taste-index",
  imageHints: "wikidata-image-hints",
};
if (Object.keys(active.derived).some((key) => !(key in derivedPrefixes))) {
  throw new Error("published active data contains an unknown derived artifact");
}
for (const [kind, relative] of Object.entries(active.derived)) {
  const match = new RegExp(`^derived/${derivedPrefixes[kind]}-([0-9a-f]{64})\\.json$`, "u")
    .exec(relative);
  if (!match || await sha256(asset(relative)) !== match[1]) {
    throw new Error(`published ${kind} artifact is mutable or corrupt`);
  }
}

console.log(
  `Verified ${active.productSnapshotId} / ${active.schemaIdentity} from ${active.sourceDataCommit}`,
);
