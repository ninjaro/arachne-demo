import type { Catalog, ResearchData, ResearchItem } from "./types";

/**
 * Human concept assertions are the presentation-readiness signal. Provider
 * metadata deliberately does not contribute to this count.
 */
export const PRESENTATION_TAG_THRESHOLD = 16;

export function excludeUnderMinedWorks(catalog: Catalog): Catalog {
  const workIds = new Set(
    catalog.works
      .filter((work) => work.conceptAssignmentCount >= PRESENTATION_TAG_THRESHOLD)
      .map((work) => work.id),
  );
  if (workIds.size === catalog.works.length) return catalog;

  const manifestationIds = new Set(
    catalog.works
      .filter((work) => workIds.has(work.id))
      .flatMap((work) => work.manifestations.map((manifestation) => manifestation.id)),
  );

  return {
    ...catalog,
    works: catalog.works.filter((work) => workIds.has(work.id)),
    workRelations: catalog.workRelations?.filter(
      (relation) => workIds.has(relation.subjectId) && workIds.has(relation.objectId),
    ),
    workMemberships: catalog.workMemberships.filter(
      (membership) => workIds.has(membership.childId) && workIds.has(membership.parentId),
    ),
    events: catalog.events.filter(
      (event) => workIds.has(event.entityId) || manifestationIds.has(event.entityId),
    ),
  };
}

function referencesExcludedWork(item: ResearchItem, workIds: ReadonlySet<string>): boolean {
  return [item.workId, item.leftId, item.rightId].some(
    (id) => id?.startsWith("work-") && !workIds.has(id),
  );
}

/** Keep the native report snapshot identity while projecting its work rows. */
export function projectResearchToCatalog(
  report: ResearchData,
  catalog: Catalog,
): ResearchData {
  const workIds = new Set(catalog.works.map((work) => work.id));
  const works = report.centrality_scale_coverage.works.filter((work) =>
    workIds.has(work.work_id),
  );
  const conceptAssignmentCount = works.reduce(
    (total, work) => total + work.concept_assignment_count,
    0,
  );
  const missingCentralityScaleCount = works.reduce(
    (total, work) => total + work.missing_centrality_scale_count,
    0,
  );
  const items = report.items.filter((item) => !referencesExcludedWork(item, workIds));

  return {
    ...report,
    centrality_scale_coverage: {
      ...report.centrality_scale_coverage,
      concept_assignment_count: conceptAssignmentCount,
      missing_centrality_scale_count: missingCentralityScaleCount,
      missing_centrality_scale_fraction:
        conceptAssignmentCount === 0
          ? 0
          : missingCentralityScaleCount / conceptAssignmentCount,
      works,
    },
    summary: {
      total: items.length,
      qualityGaps: items.filter((item) => item.kind === "quality_gap").length,
      ingestIssues: items.filter((item) => item.kind === "ingest_issue").length,
      mergeHints: items.filter((item) => item.kind === "merge_hint").length,
      problems: items.filter((item) => item.severity === "problem").length,
      weak: items.filter((item) => item.severity === "weak").length,
      info: items.filter((item) => item.severity === "info").length,
    },
    items,
  };
}
