import { describe, expect, it } from "vitest";
import {
  aggregateProfileIsCollapsible,
  buildAtomicTrajectoryProfile,
  deriveEvolutionAggregateProfile,
  selectHierarchyCollapseGroups,
  weightedSparseJaccard,
} from "./evolution-aggregation";
import type { ConceptAssignment, Work } from "./types";
import { buildEvolutionHierarchyIndex } from "./evolution-hierarchy";
import { fixtureDomain, fixtureWork } from "./test-fixtures";
import { buildEvolutionIndex, buildVisibleEvolution } from "./evolution";

function concept(id: string, centrality: number): ConceptAssignment {
  return {
    id,
    label: id,
    slug: id,
    conceptType: "theme",
    relationType: "associated_with",
    centrality,
    centralityScale: "graded",
    historicalRole: null,
    confidence: 0.9,
  };
}

function profile(id: string, concepts: ConceptAssignment[]) {
  return buildAtomicTrajectoryProfile({ id, concepts } as Pick<Work, "id" | "concepts">);
}

describe("Evolution hierarchy aggregation", () => {
  it("compares sparse remapped profiles with weighted Jaccard", () => {
    expect(weightedSparseJaccard(
      profile("a", [concept("shared", 100), concept("left", 50)]),
      profile("b", [concept("shared", 50), concept("right", 50)]),
    )).toBe(0.25);
  });

  it("keeps coverage and direct parent assignments separate", () => {
    const aggregate = deriveEvolutionAggregateProfile([
      { workId: "track-a", profile: profile("track-a", [concept("industrial", 100)]) },
      { workId: "track-b", profile: profile("track-b", []) },
      { workId: "track-c", profile: profile("track-c", []) },
      { workId: "track-d", profile: profile("track-d", []) },
    ], profile("album", [concept("industrial", 50)]));
    const support = aggregate.supportByTagId.get("industrial")!;
    expect(support.derived).toMatchObject({
      supportCount: 1,
      representedWorkCount: 4,
      coverage: 0.25,
      meanStrength: 1,
      displayStrength: 0.25,
    });
    expect(support.directParentAssignment).toMatchObject({
      rawStrength: 50,
      strength: 0.5,
    });
  });

  it("collapses homogeneous siblings but rejects semantic mixtures", () => {
    const homogeneous = deriveEvolutionAggregateProfile([
      { workId: "a", profile: profile("a", [concept("x", 90)]) },
      { workId: "b", profile: profile("b", [concept("x", 100)]) },
    ]);
    const mixed = deriveEvolutionAggregateProfile([
      { workId: "a", profile: profile("a", [concept("x", 100)]) },
      { workId: "b", profile: profile("b", [concept("y", 100)]) },
    ]);
    expect(aggregateProfileIsCollapsible(homogeneous)).toBe(true);
    expect(aggregateProfileIsCollapsible(mixed)).toBe(false);
  });

  it("selects the highest non-overlapping homogeneous hierarchy group", () => {
    const works = [
      fixtureWork({ id: "series", year: 2000, tags: [] }),
      fixtureWork({ id: "season", year: 2000, tags: [] }),
      fixtureWork({ id: "episode-a", year: 2000, tags: [] }),
      fixtureWork({ id: "episode-b", year: 2001, tags: [] }),
    ];
    const domain = fixtureDomain(works);
    domain.workMemberships = [
      { id: "season-series", childId: "season", parentId: "series", membershipType: "season_of", position: 1, positionText: null },
      { id: "a-season", childId: "episode-a", parentId: "season", membershipType: "episode_of", position: 1, positionText: null },
      { id: "b-season", childId: "episode-b", parentId: "season", membershipType: "episode_of", position: 2, positionText: null },
    ];
    const sharedProfile = profile("episode", [concept("shared", 100)]);
    const groups = selectHierarchyCollapseGroups(
      buildEvolutionHierarchyIndex(domain),
      new Map([
        ["season", sharedProfile],
        ["episode-a", sharedProfile],
        ["episode-b", sharedProfile],
      ]),
      new Map(),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      parentId: "series",
      membershipType: "season_of",
      representedWorkIds: ["season", "episode-a", "episode-b"],
    });
  });

  it("projects homogeneous canonical children only after atomic traversal", () => {
    const works = [
      fixtureWork({ id: "album", year: 1999, tags: [] }),
      fixtureWork({ id: "track-a", year: 2000, tags: ["shared"] }),
      fixtureWork({ id: "track-b", year: 2001, tags: ["shared"] }),
      fixtureWork({ id: "track-c", year: 2002, tags: ["shared"] }),
    ];
    const domain = fixtureDomain(works);
    domain.workMemberships = ["track-a", "track-b", "track-c"].map(
      (childId, index) => ({
        id: `${childId}-album`,
        childId,
        parentId: "album",
        membershipType: "track_of" as const,
        position: index + 1,
        positionText: null,
      }),
    );
    const visible = buildVisibleEvolution(buildEvolutionIndex(domain), {
      seedTagIds: ["shared"],
      excludedTagIds: [],
      earlierDepth: 0,
      laterDepth: 0,
      expansionMode: "directional",
      includeYearOnly: true,
      includeAmbiguous: false,
    });
    expect(visible.stations).toHaveLength(1);
    expect(visible.stations[0]).toMatchObject({
      id: "hierarchy:album",
      hierarchyParentId: "album",
      membershipType: "track_of",
      workIds: ["track-a", "track-b", "track-c"],
      temporal: { displayLabel: "2000" },
    });
    const expanded = buildVisibleEvolution(buildEvolutionIndex(domain), {
      ...visible.filters,
      expandedHierarchyParentIds: ["album"],
    });
    expect(expanded.stations.map((station) => station.id)).toEqual([
      "work:track-a",
      "work:track-b",
      "work:track-c",
    ]);
    expect(expanded.stations.map((station) => station.hierarchySiblingOrder)).toEqual([
      0,
      1,
      2,
    ]);
  });

  it("surfaces a focus-relevant exceptional child from an otherwise homogeneous group", () => {
    const children = Array.from({ length: 10 }, (_, index) =>
      fixtureWork({ id: `episode-${index}`, year: 2000 + index, tags: [] }));
    const parent = fixtureWork({ id: "series", year: 2000, tags: [] });
    const domain = fixtureDomain([parent, ...children]);
    domain.workMemberships = children.map((child, index) => ({
      id: `${child.id}-series`,
      childId: child.id,
      parentId: parent.id,
      membershipType: "episode_of" as const,
      position: index + 1,
      positionText: null,
    }));
    const common = profile("common", [concept("common", 100)]);
    const exceptional = profile("exceptional", [concept("film-noir", 100)]);
    const profileByWorkId = new Map(children.map((child, index) => [
      child.id,
      index === 9 ? exceptional : common,
    ]));
    const groups = selectHierarchyCollapseGroups(
      buildEvolutionHierarchyIndex(domain),
      profileByWorkId,
      new Map(),
      new Set(),
      new Set(["film-noir"]),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.representedWorkIds).toHaveLength(9);
    expect(groups[0]!.surfacedOutlierWorkIds).toEqual(["episode-9"]);
  });

  it("uses every canonical child as the aggregate coverage denominator", () => {
    const album = fixtureWork({ id: "album", year: 2000, tags: [] });
    const tracks = Array.from({ length: 10 }, (_, index) => fixtureWork({
      id: `track-${index}`,
      year: 2000 + index,
      tags: index < 2 ? ["common", "industrial"] : ["common"],
    }));
    const domain = fixtureDomain([album, ...tracks]);
    domain.workMemberships = tracks.map((track, index) => ({
      id: `${track.id}-album`,
      childId: track.id,
      parentId: album.id,
      membershipType: "track_of" as const,
      position: index + 1,
      positionText: null,
    }));
    const visible = buildVisibleEvolution(buildEvolutionIndex(domain), {
      seedTagIds: ["common", "industrial"],
      excludedTagIds: [],
      earlierDepth: 0,
      laterDepth: 0,
      expansionMode: "directional",
      includeYearOnly: true,
      includeAmbiguous: false,
    });
    expect(visible.stations).toHaveLength(1);
    expect(visible.stations[0]!.hierarchyChildIds).toHaveLength(10);
    expect(visible.aggregateMembershipsByTagId.get("industrial")?.[0]?.strengthSummary)
      .toMatchObject({
        supportCount: 2,
        representedWorkCount: 10,
        coverage: 0.2,
        displayStrength: 0.1,
      });
  });
});
