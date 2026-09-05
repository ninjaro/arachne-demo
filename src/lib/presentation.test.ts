import { describe, expect, it } from "vitest";

import { isCatalog, isResearchData } from "./data";
import {
  excludeUnderMinedWorks,
  PRESENTATION_TAG_THRESHOLD,
  projectResearchToCatalog,
} from "./presentation";
import { fixtureWork } from "./test-fixtures";
import type { Catalog, ProductEvent, ResearchData, ResearchItem } from "./types";

const SHA256 = "a".repeat(64);

function tags(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `concept-${index}`);
}

function researchItem(id: string, workId: string, severity: ResearchItem["severity"]): ResearchItem {
  return {
    id,
    kind: "quality_gap",
    severity,
    category: "coverage",
    title: id,
    message: id,
    workId,
  };
}

describe("presentation tag-tail policy", () => {
  it("removes under-mined works and their work-owned graph rows", () => {
    const visible = fixtureWork({
      id: "work-visible",
      year: 2000,
      tags: tags(PRESENTATION_TAG_THRESHOLD),
    });
    const hidden = fixtureWork({ id: "work-hidden", year: 2001, tags: tags(15) });
    const event: ProductEvent = {
      id: "event-hidden",
      entityId: hidden.id,
      eventType: "released",
      yearStart: 2001,
      yearEnd: null,
      dateText: "2001",
      datePrecision: "year",
      placeText: null,
    };
    hidden.events = [event];
    const catalog: Catalog = {
      formatVersion: 1,
      productSnapshotId: "product-test",
      databaseSha256: SHA256,
      agents: [],
      works: [visible, hidden],
      workRelations: [
        { subjectId: visible.id, objectId: hidden.id, relationType: "influenced_by" },
      ],
      workMemberships: [
        {
          id: "membership-hidden",
          childId: hidden.id,
          parentId: visible.id,
          membershipType: "part_of",
          position: null,
          positionText: null,
        },
      ],
      agentRelations: [],
      events: [event],
    };

    const projected = excludeUnderMinedWorks(catalog);

    expect(projected.works.map((work) => work.id)).toEqual([visible.id]);
    expect(projected.workRelations).toEqual([]);
    expect(projected.workMemberships).toEqual([]);
    expect(projected.events).toEqual([]);
    expect(isCatalog(projected)).toBe(true);
  });

  it("projects native research coverage and summaries to visible works", () => {
    const catalog: Catalog = {
      formatVersion: 1,
      productSnapshotId: "product-test",
      databaseSha256: SHA256,
      agents: [],
      works: [fixtureWork({ id: "work-visible", year: 2000, tags: tags(16) })],
      workRelations: [],
      workMemberships: [],
      agentRelations: [],
      events: [],
    };
    const report: ResearchData = {
      artifact_type: "product_research_report_v1",
      format_version: 1,
      product_snapshot: { snapshot_id: "product-test", sha256: SHA256 },
      formatVersion: 1,
      productSnapshotId: "product-test",
      centrality_scale_coverage: {
        centrality_scale_scope: "work_concept_assignment",
        concept_assignment_count: 31,
        missing_centrality_scale_count: 31,
        missing_centrality_scale_fraction: 1,
        none_is_missing_semantic_review: true,
        none_numeric_compatibility_fallback: "stored_centrality_unchanged",
        fallback_is_proof_of_numeric_calibration: false,
        centrality_scale_inferred: false,
        canonical_values_written: false,
        works: [
          {
            work_id: "work-visible",
            concept_assignment_count: 16,
            missing_centrality_scale_count: 16,
            missing_centrality_scale_fraction: 1,
            semantic_review_missing: true,
          },
          {
            work_id: "work-hidden",
            concept_assignment_count: 15,
            missing_centrality_scale_count: 15,
            missing_centrality_scale_fraction: 1,
            semantic_review_missing: true,
          },
        ],
      },
      summary: {
        total: 2,
        qualityGaps: 2,
        ingestIssues: 0,
        mergeHints: 0,
        problems: 1,
        weak: 1,
        info: 0,
      },
      items: [
        researchItem("visible", "work-visible", "weak"),
        researchItem("hidden", "work-hidden", "problem"),
      ],
    };

    const projected = projectResearchToCatalog(report, catalog);

    expect(projected.centrality_scale_coverage.works).toHaveLength(1);
    expect(projected.centrality_scale_coverage.concept_assignment_count).toBe(16);
    expect(projected.items.map((item) => item.id)).toEqual(["visible"]);
    expect(projected.summary).toMatchObject({ total: 1, weak: 1, problems: 0 });
    expect(isResearchData(projected)).toBe(true);
  });
});
