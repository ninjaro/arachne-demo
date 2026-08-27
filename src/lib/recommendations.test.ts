import { describe, expect, it } from "vitest";
import { featureIndexFromTasteIndex } from "./features";
import { scoreRecommendations } from "./recommendations";
import { DEFAULT_SETTINGS } from "./settings";
import type { TasteIndex } from "./taste";
import { fixtureDomain, fixtureWork } from "./test-fixtures";

interface WorkVector {
  id: string;
  label?: string;
  year?: number;
  features: Record<string, number>;
}

function setup(specs: WorkVector[]) {
  const works = specs.map((spec) => fixtureWork({
    id: spec.id,
    label: spec.label ?? spec.id,
    year: spec.year ?? 2000,
    tags: [],
  }));
  const featureKeys = new Set(specs.flatMap((spec) => Object.keys(spec.features)));
  const tasteIndex: TasteIndex = {
    productSnapshotId: "product-test",
    productContentSha256: null,
    features: new Map([...featureKeys].map((key) => [key, {
      label: key.replace("concept:", ""),
      source: "concept",
      category: "genre",
      relationType: null,
    }])),
    entities: new Map(specs.map((spec) => {
      const features = new Map(Object.entries(spec.features));
      return [spec.id, {
        family: "work" as const,
        features,
        norm: Math.hypot(...features.values()),
      }];
    })),
    postings: new Map([...featureKeys].map((key) => [key, new Map(
      specs.flatMap((spec) => {
        const value = spec.features[key];
        return value === undefined ? [] : [[spec.id, value] as const];
      }),
    )])),
  };
  return {
    domain: fixtureDomain(works),
    index: featureIndexFromTasteIndex(tasteIndex),
    tasteIndex,
  };
}

describe("scoreRecommendations", () => {
  it("excludes rated works and retains positive and negative native evidence", () => {
    const fixture = setup([
      { id: "liked", features: { "concept:thriller": 0.8 } },
      { id: "disliked", features: { "concept:slapstick": 0.8 } },
      {
        id: "candidate",
        features: {
          "concept:thriller": 0.7,
          "concept:slapstick": 0.3,
        },
      },
    ]);

    const results = scoreRecommendations(
      fixture.domain,
      fixture.index,
      { liked: 1, disliked: -1 },
      DEFAULT_SETTINGS,
      fixture.tasteIndex,
    );

    expect(results.map((result) => result.work.id)).toEqual(["candidate"]);
    expect(results[0]!.positive).toEqual([
      expect.objectContaining({ id: "concept:thriller", label: "thriller" }),
    ]);
    expect(results[0]!.negative).toEqual([
      expect.objectContaining({ id: "concept:slapstick", label: "slapstick" }),
    ]);
  });

  it("requires positive evidence instead of recommending a disliked-only match", () => {
    const fixture = setup([
      { id: "liked", features: { "concept:thriller": 0.8 } },
      { id: "disliked", features: { "concept:slapstick": 0.8 } },
      { id: "candidate", features: { "concept:slapstick": 0.7 } },
    ]);

    expect(scoreRecommendations(
      fixture.domain,
      fixture.index,
      { liked: 1, disliked: -1 },
      DEFAULT_SETTINGS,
      fixture.tasteIndex,
    )).toEqual([]);
  });

  it("is deterministic and applies the configured limit after stable tie-breaks", () => {
    const fixture = setup([
      { id: "liked", features: { "concept:shared": 1 } },
      { id: "alpha", label: "Alpha", year: 2001, features: { "concept:shared": 1 } },
      { id: "gamma", label: "Gamma", year: 1999, features: { "concept:shared": 1 } },
      { id: "beta", label: "Beta", year: 1999, features: { "concept:shared": 1 } },
    ]);
    const settings = {
      ...DEFAULT_SETTINGS,
      recommendation: { limit: 2 },
    };
    const score = () => scoreRecommendations(
      fixture.domain,
      fixture.index,
      { liked: 1 },
      settings,
      fixture.tasteIndex,
    ).map((result) => result.work.id);

    expect(score()).toEqual(["beta", "gamma"]);
    expect(score()).toEqual(score());
  });
});
