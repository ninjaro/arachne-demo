import { describe, expect, it } from "vitest";
import { buildEvolutionHierarchyIndex } from "./evolution-hierarchy";
import { fixtureDomain, fixtureWork } from "./test-fixtures";
import type { WorkMembership } from "./types";

function membership(
  childId: string,
  parentId: string,
  position: number | null,
  positionText: string | null = null,
): WorkMembership {
  return {
    id: `${childId}-membership`,
    childId,
    parentId,
    membershipType: "track_of",
    position,
    positionText,
  };
}

describe("Evolution work hierarchy", () => {
  it("orders siblings by position, natural position text, date, then ID", () => {
    const works = [
      fixtureWork({ id: "parent", year: 1980, tags: [] }),
      fixtureWork({ id: "position-10", year: 1970, tags: [] }),
      fixtureWork({ id: "position-2", year: 2010, tags: [] }),
      fixtureWork({ id: "text-10", year: 1970, tags: [] }),
      fixtureWork({ id: "text-2", year: 2010, tags: [] }),
      fixtureWork({ id: "dated-later-b", year: 2000, tags: [] }),
      fixtureWork({ id: "dated-later-a", year: 2000, tags: [] }),
      fixtureWork({ id: "dated-earlier", year: 1990, tags: [] }),
      fixtureWork({ id: "undated", year: null, tags: [] }),
    ];
    const domain = fixtureDomain(works);
    domain.workMemberships = [
      membership("undated", "parent", null),
      membership("dated-later-b", "parent", null),
      membership("text-10", "parent", null, "Track 10"),
      membership("position-10", "parent", 10),
      membership("dated-earlier", "parent", null),
      membership("position-2", "parent", 2),
      membership("text-2", "parent", null, "Track 2"),
      membership("dated-later-a", "parent", null),
    ];

    const hierarchy = buildEvolutionHierarchyIndex(domain);

    expect(hierarchy.childrenByParentId.get("parent")).toEqual([
      "position-2",
      "position-10",
      "text-2",
      "text-10",
      "dated-earlier",
      "dated-later-a",
      "dated-later-b",
      "undated",
    ]);
    expect(hierarchy.parentByChildId.get("position-2")).toBe("parent");
    expect(hierarchy.membershipByChildId.get("text-2")).toMatchObject({
      membershipType: "track_of",
      position: null,
      positionText: "Track 2",
    });
  });

  it("terminates ancestor and descendant traversal when memberships cycle", () => {
    const domain = fixtureDomain([
      fixtureWork({ id: "a", year: 2000, tags: [] }),
      fixtureWork({ id: "b", year: 2001, tags: [] }),
      fixtureWork({ id: "c", year: 2002, tags: [] }),
    ]);
    domain.workMemberships = [
      membership("a", "c", 1),
      membership("b", "a", 1),
      membership("c", "b", 1),
    ];

    const hierarchy = buildEvolutionHierarchyIndex(domain);

    expect(hierarchy.ancestorsOf("a")).toEqual(["c", "b"]);
    expect(hierarchy.descendantsOf("a")).toEqual(["b", "c"]);
    expect(hierarchy.ancestorsOf("missing")).toEqual([]);
    expect(hierarchy.descendantsOf("missing")).toEqual([]);
  });
});
