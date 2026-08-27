import { describe, expect, it } from "vitest";
import type { FeatureIndex } from "./features";
import { buildIslandsGraph } from "./islands";
import { DEFAULT_SETTINGS } from "./settings";
import { fixtureDomain, fixtureWork } from "./test-fixtures";
import type { TasteIndex } from "./taste";

const EMPTY_TASTE_INDEX: TasteIndex = {
  productSnapshotId: "test",
  productContentSha256: null,
  features: new Map(),
  entities: new Map(),
  postings: new Map(),
};

function emptyFeatureIndex(ids: string[]): FeatureIndex {
  return {
    featuresById: new Map(ids.map((id) => [id, []])),
    vectors: new Map(ids.map((id) => [id, new Map()])),
    norms: new Map(ids.map((id) => [id, 0])),
    documentFrequency: new Map(),
    postings: new Map(),
    size: ids.length,
  };
}

describe("buildIslandsGraph", () => {
  it("keeps explicit work relations outside similarity and prioritizes them under the edge cap", () => {
    const works = [
      fixtureWork({ id: "work-a", year: 1900, tags: [] }),
      fixtureWork({ id: "work-b", year: 1910, tags: [] }),
    ];
    const domain = fixtureDomain(works, [
      { subjectId: "work-b", objectId: "work-a", relationType: "influenced_by" },
      { subjectId: "work-a", objectId: "work-b", relationType: "adapted_from" },
    ]);
    const graph = buildIslandsGraph(
      domain,
      emptyFeatureIndex(works.map((work) => work.id)),
      { "work-a": 1, "work-b": -1 },
      {
        ...DEFAULT_SETTINGS,
        islands: {
          ...DEFAULT_SETTINGS.islands,
          maxEdges: 1,
          maxInferredNeighborsPerNode: 0,
        },
      },
      EMPTY_TASTE_INDEX,
    );

    expect(graph.edges).toEqual([
      expect.objectContaining({
        source: "work-a",
        target: "work-b",
        kind: "explicit",
        similarity: 0,
        relations: [
          { subjectId: "work-a", objectId: "work-b", relationType: "adapted_from" },
          { subjectId: "work-b", objectId: "work-a", relationType: "influenced_by" },
        ],
      }),
    ]);
    expect(graph.components.map((component) => component.nodeIds)).toEqual([
      ["work-a", "work-b"],
    ]);
  });
});
