import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isResearchData } from "../lib/data";
import { parseTasteIndex } from "../lib/taste";
import { openDemoData } from "./index";

const activePath = "public/data/active.json";
const active = existsSync(activePath)
  ? JSON.parse(readFileSync(activePath, "utf8")) as {
      productSnapshotId: string;
      productSha256: string;
      derived?: { research?: string; taste?: string };
    }
  : null;
const researchPath = active?.derived?.research
  ? `public/data/${active.derived.research}`
  : "";
const tastePath = active?.derived?.taste
  ? `public/data/${active.derived.taste}`
  : "";
const hasPinnedArtifacts = !!active && !!researchPath && !!tastePath &&
  existsSync(researchPath) && existsSync(tastePath);

function requireActive() {
  if (!active) throw new Error("active data manifest is absent");
  return active;
}

if (process.env.ARACHNE_REQUIRE_NATIVE_ARTIFACTS === "1" && !hasPinnedArtifacts) {
  throw new Error("required exact-state native research/taste artifacts were not published");
}

describe.skipIf(!hasPinnedArtifacts)("pinned native artifacts", () => {
  it("parses exact-state native research without changing its semantics", () => {
    const pinnedActive = requireActive();
    const value: unknown = JSON.parse(
      readFileSync(researchPath, "utf8"),
    );
    expect(isResearchData(value)).toBe(true);
    if (!isResearchData(value)) return;
    expect(value.productSnapshotId).toBe(pinnedActive.productSnapshotId);
    expect(value.product_snapshot.sha256).toBe(pinnedActive.productSha256);
  });

  it("parses the complete native taste contract and snapshot identity", () => {
    const pinnedActive = requireActive();
    const value: unknown = JSON.parse(
      readFileSync(tastePath, "utf8"),
    );
    const parsed = parseTasteIndex(value, {
      snapshotId: pinnedActive.productSnapshotId,
      contentSha256: pinnedActive.productSha256,
    });
    expect(parsed.entities.size).toBeGreaterThan(0);
    expect(parsed.features.size).toBeGreaterThan(0);
  });

  it("hydrates Browse, one detail, and graph data through real fallback shards", async () => {
    const localFetch = async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      const relative = url.pathname.replace(/^\/data\//u, "");
      try {
        return new Response(readFileSync(`public/data/${relative}`));
      } catch {
        return new Response(null, { status: 404 });
      }
    };
    const adapter = await openDemoData(new URL("https://pinned.test/data/"), {
      fetcher: localFetch as typeof fetch,
      rangeProbe: async () => false,
    });
    const browse = await adapter.browseCatalog();
    expect(browse.works.length).toBeGreaterThan(25_000);
    expect(browse.agents.length).toBeGreaterThan(10_000);
    expect(browse.events).toHaveLength(0);
    const work = await adapter.work(browse.works[0].id);
    expect(work?.id).toBe(browse.works[0].id);
    const graph = await adapter.catalog();
    expect(graph.works).toHaveLength(browse.works.length);
    expect(graph.events.length).toBeGreaterThanOrEqual(0);
    adapter.close();
  }, 30_000);
});
