import { useEffect, useMemo, useRef, useState } from "react";
import { openDemoData, ProjectionUnavailableError } from "./data";
import type { DemoDataAdapter } from "./data";
import { buildDomain } from "./lib/data";
import { featureIndexFromTasteIndex } from "./lib/features";
import { buildResearchData } from "./lib/research";
import { DEFAULT_SETTINGS } from "./lib/settings";
import type { BrowseFilters, BrowseSort } from "./lib/browse";
import {
  buildViewerHref,
  readEntityPermalink,
  readViewerLocation,
} from "./lib/location";
import type { ViewerLocationState, ViewName } from "./lib/location";
import { loadRatings, saveRatings, toggleRating } from "./lib/ratings";
import { appendQueryTerms } from "./lib/query";
import { loadTasteIndex } from "./lib/taste";
import type { TasteIndex } from "./lib/taste";
import type {
  Catalog,
  Domain,
  EntityId,
  EntityOpenContext,
  RatingValue,
  Ratings,
  ResearchData,
} from "./lib/types";
import { BrowseView } from "./views/BrowseView";
import { RecommendationsView } from "./views/RecommendationsView";
import { EvolutionView } from "./views/EvolutionView";
import { IslandsView } from "./views/IslandsView";
import { ResearchView } from "./views/ResearchView";
import { TasteView } from "./views/TasteView";
import {
  FloatingEntityWindows,
  useEntityWindows,
} from "./components/windows";
import "./styles.css";
import "./enhancements.css";

const VIEWS: Array<{ name: ViewName; label: string }> = [
  { name: "browse", label: "Browse" },
  { name: "evolution", label: "Evolution" },
  { name: "taste", label: "Taste" },
  { name: "research", label: "Research" },
];

const LAB_VIEWS: Array<{ name: ViewName; label: string }> = [
  { name: "recommendations", label: "Recommendations" },
  { name: "islands", label: "Islands" },
];

const LOCATION_DEFAULTS = {
  pageSize: DEFAULT_SETTINGS.browse.defaultPageSize,
  pageSizeOptions: DEFAULT_SETTINGS.browse.pageSizeOptions,
};

function DerivedViewState({
  title,
  error,
}: {
  title: string;
  error: string;
}) {
  return (
    <section className={error ? "state error-panel" : "state"}>
      <h2>{error ? `${title} unavailable` : `Loading ${title.toLocaleLowerCase()}…`}</h2>
      {error ? <p>{error}</p> : null}
    </section>
  );
}

export default function App() {
  const [initialLocation] = useState(() =>
    readViewerLocation(
      window.location,
      import.meta.env.BASE_URL,
      LOCATION_DEFAULTS,
    ),
  );
  const [initialEntityPermalink] = useState(() =>
    readEntityPermalink(
      window.location.pathname,
      import.meta.env.BASE_URL,
      window.location.hash,
    ),
  );
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [externalResearch, setExternalResearch] = useState<ResearchData | null>(null);
  const [tasteIndex, setTasteIndex] = useState<TasteIndex | null>(null);
  const [domain, setDomain] = useState<Domain | null>(null);
  const [error, setError] = useState("");
  const [researchError, setResearchError] = useState("");
  const [tasteIndexError, setTasteIndexError] = useState("");
  const [imageHintsUrl, setImageHintsUrl] = useState("");
  const [view, setView] = useState<ViewName>(initialLocation.view);
  const [ratings, setRatings] = useState<Ratings>(() => loadRatings());
  const [filters, setFilters] = useState<BrowseFilters>(
    initialLocation.browse.filters,
  );
  const [sort, setSort] = useState<BrowseSort>(initialLocation.browse.sort);
  const [page, setPage] = useState(initialLocation.browse.page);
  const [pageSize, setPageSize] = useState(initialLocation.browse.pageSize);
  const [requestedEvolutionTagId, setRequestedEvolutionTagId] = useState<EntityId | null>(null);
  const [searchCandidateIds, setSearchCandidateIds] = useState<ReadonlySet<EntityId> | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const dataRef = useRef<DemoDataAdapter | null>(null);
  const fullCatalogRef = useRef<Promise<Catalog> | null>(null);

  const {
    windows,
    openWindow,
    openWindows,
    focusWindow,
    closeWindow,
    moveWindow,
  } = useEntityWindows();

  function openEntityForView(id: EntityId, context?: EntityOpenContext) {
    void hydrateEntity(id).catch((cause: unknown) => {
      console.warn(`Unable to hydrate ${id}`, cause);
    });
    if (view === "evolution" || view === "islands") {
      openWindow(id, { mode: "replace", context });
      return;
    }
    if (view === "recommendations" || view === "research") {
      openWindow(id, { mode: "append", limit: 2, context });
      return;
    }
    openWindow(id, { mode: "append", context });
  }

  function installCatalog(next: Catalog) {
    setCatalog(next);
    setDomain(buildDomain(next));
  }

  function mergeById<T extends { id: string }>(left: T[], right: T[]): T[] {
    return [...new Map([...left, ...right].map((value) => [value.id, value])).values()];
  }

  async function hydrateEntity(id: EntityId) {
    const data = dataRef.current;
    if (!data || fullCatalogRef.current) return;
    if (id.startsWith("work-")) {
      const [work, structure] = await Promise.all([
        data.work(id),
        data.workStructure(id),
      ]);
      if (!work) return;
      setCatalog((current) => {
        if (!current) return current;
        const next: Catalog = {
          ...current,
          works: current.works.map((value) => value.id === id ? work : value),
          workMemberships: mergeById(current.workMemberships, structure.memberships),
          workRelations: [
            ...new Map(
              [...(current.workRelations ?? []), ...structure.relations].map((relation) => [
                `${relation.subjectId}\0${relation.relationType}\0${relation.objectId}`,
                relation,
              ]),
            ).values(),
          ],
        };
        setDomain(buildDomain(next));
        return next;
      });
    } else if (id.startsWith("agent-")) {
      const [agent, relations] = await Promise.all([
        data.agent(id),
        data.relationsForAgent(id),
      ]);
      if (!agent) return;
      setCatalog((current) => {
        if (!current) return current;
        const next: Catalog = {
          ...current,
          agents: current.agents.map((value) => value.id === id ? agent : value),
          agentRelations: mergeById(current.agentRelations, relations),
        };
        setDomain(buildDomain(next));
        return next;
      });
    }
  }

  async function ensureFullCatalog() {
    const data = dataRef.current;
    if (!data) return;
    try {
      fullCatalogRef.current ??= data.catalog();
      installCatalog(await fullCatalogRef.current);
    } catch (cause) {
      fullCatalogRef.current = null;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  useEffect(() => {
    let active = true;
    let dataClose: (() => void) | null = null;
    openDemoData()
      .then(async (data) => {
        dataClose = () => data.close();
        const graphHeavy = initialLocation.view === "evolution" || initialLocation.view === "islands";
        const loadedCatalog = graphHeavy ? await data.catalog() : await data.browseCatalog();
        if (!active) {
          data.close();
          return;
        }
        dataRef.current = data;
        setDataReady(true);
        if (graphHeavy) fullCatalogRef.current = Promise.resolve(loadedCatalog);
        installCatalog(loadedCatalog);
        setImageHintsUrl(data.asset("imageHints") ?? "");

        void data.research()
          .then((loadedResearch) => {
            if (active) {
              setExternalResearch(buildResearchData(loadedCatalog, loadedResearch));
            }
          })
          .catch((cause: unknown) => {
            if (active) {
              setResearchError(
                cause instanceof ProjectionUnavailableError || cause instanceof Error
                  ? cause.message
                  : String(cause),
              );
            }
          });
        const tasteIndexUrl = data.asset("taste");
        if (!tasteIndexUrl) {
          setTasteIndexError(
            "Taste is unavailable for this pinned snapshot; no native taste projection was published.",
          );
        } else void loadTasteIndex(
            tasteIndexUrl,
            {
              snapshotId: loadedCatalog.productSnapshotId,
              contentSha256: loadedCatalog.databaseSha256,
            },
          )
          .then((loadedTasteIndex) => {
            if (active) setTasteIndex(loadedTasteIndex);
          })
          .catch((cause: unknown) => {
            if (active) {
              setTasteIndexError(cause instanceof Error ? cause.message : String(cause));
            }
          });
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      active = false;
      dataRef.current = null;
      setDataReady(false);
      dataClose?.();
    };
  }, []);

  useEffect(() => saveRatings(ratings), [ratings]);

  useEffect(() => {
    let active = true;
    const query = filters.query.trim();
    const isPlainNameQuery = query.length >= 2 &&
      /^[\p{L}\p{N}\p{M}\s.'’&+_-]+$/u.test(query);
    if (view !== "browse" || !dataReady || !isPlainNameQuery) {
      setSearchCandidateIds(null);
      return () => { active = false; };
    }
    setSearchCandidateIds(null);
    const timeout = window.setTimeout(() => {
      void dataRef.current?.search(query, 10_000)
        .then((results) => {
          if (active) setSearchCandidateIds(new Set(results.map((result) => result.id)));
        })
        .catch((cause: unknown) => {
          if (active) {
            setSearchCandidateIds(null);
            console.warn("Bounded name search unavailable", cause);
          }
        });
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [dataReady, filters.query, view]);

  useEffect(() => {
    if (!domain || !initialEntityPermalink) return;
    const valid = initialEntityPermalink.family === "work"
      ? domain.workById.has(initialEntityPermalink.id)
      : domain.agentById.has(initialEntityPermalink.id);
    if (valid) openEntityForView(initialEntityPermalink.id);
  }, [domain, initialEntityPermalink, openWindow]);

  useEffect(() => {
    const applyLocation = () => {
      const next = readViewerLocation(
        window.location,
        import.meta.env.BASE_URL,
        LOCATION_DEFAULTS,
      );
      if (next.view !== "browse") openWindows([]);
      setView(next.view);
      setFilters(next.browse.filters);
      setSort(next.browse.sort);
      setPage(next.browse.page);
      setPageSize(next.browse.pageSize);
    };

    const canonical = buildViewerHref(
      initialLocation,
      import.meta.env.BASE_URL,
      LOCATION_DEFAULTS,
    );
    if (
      !initialEntityPermalink &&
      initialLocation.view === "browse" &&
      `${window.location.pathname}${window.location.search}` !== canonical
    ) {
      window.history.replaceState(null, "", canonical);
    }

    window.addEventListener("popstate", applyLocation);
    return () => window.removeEventListener("popstate", applyLocation);
  }, [initialEntityPermalink, initialLocation, openWindows]);

  const featureIndex = useMemo(
    () => tasteIndex ? featureIndexFromTasteIndex(tasteIndex) : null,
    [tasteIndex],
  );

  const research = externalResearch;

  function rate(id: EntityId, value: RatingValue) {
    setRatings((current) => toggleRating(current, id, value));
  }

  function currentLocation(overrides: {
    view?: ViewName;
    filters?: BrowseFilters;
    sort?: BrowseSort;
    page?: number;
    pageSize?: number;
  } = {}): ViewerLocationState {
    return {
      view: overrides.view ?? view,
      browse: {
        filters: overrides.filters ?? filters,
        sort: overrides.sort ?? sort,
        page: overrides.page ?? page,
        pageSize: overrides.pageSize ?? pageSize,
      },
    };
  }

  function writeLocation(
    next: ViewerLocationState,
    mode: "push" | "replace",
  ) {
    const href = buildViewerHref(
      next,
      import.meta.env.BASE_URL,
      LOCATION_DEFAULTS,
    );
    if (mode === "push") window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
  }

  function navigateView(next: ViewName) {
    if (next === view) return;
    if (next !== "browse") openWindows([]);
    setView(next);
    if (next === "evolution" || next === "islands") void ensureFullCatalog();
    writeLocation(currentLocation({ view: next }), "push");
  }

  function updateFilters(next: BrowseFilters) {
    setFilters(next);
    setPage(1);
    writeLocation(currentLocation({ filters: next, page: 1 }), "replace");
  }

  function updateSort(next: BrowseSort) {
    setSort(next);
    setPage(1);
    writeLocation(currentLocation({ sort: next, page: 1 }), "replace");
  }

  function updatePage(next: number) {
    setPage(next);
    writeLocation(currentLocation({ page: next }), "push");
  }

  function updatePageSize(next: number) {
    setPageSize(next);
    setPage(1);
    writeLocation(currentLocation({ page: 1, pageSize: next }), "replace");
  }

  function searchBrowse(query: string) {
    const nextFilters = {
      ...filters,
      query: appendQueryTerms(filters.query, query),
    };
    setView("browse");
    setFilters(nextFilters);
    setPage(1);
    writeLocation(
      currentLocation({ view: "browse", filters: nextFilters, page: 1 }),
      "push",
    );
  }

  function openConceptInEvolution(id: EntityId) {
    setRequestedEvolutionTagId(id);
    navigateView("evolution");
  }

  if (error) {
    return (
      <main className="state error-panel">
        <h2>Catalog failed to load</h2>
        <p>{error}</p>
      </main>
    );
  }

  if (!catalog || !domain) {
    return <main className="state">Loading pinned product data…</main>;
  }

  const imageHintProduct = catalog.databaseSha256
    ? { contentSha256: catalog.databaseSha256 }
    : { snapshotId: catalog.productSnapshotId };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Arachne</h1>
          <span>
            {domain.works.length.toLocaleString()} works ·{" "}
            {domain.agents.length.toLocaleString()} agents ·{" "}
            {catalog.productSnapshotId}
          </span>
        </div>

        <nav className="view-tabs" aria-label="Main views">
          {VIEWS.map(({ name, label }) => (
            <a
              key={name}
              href={buildViewerHref(
                currentLocation({ view: name }),
                import.meta.env.BASE_URL,
                LOCATION_DEFAULTS,
              )}
              className={view === name ? "tab active" : "tab"}
              aria-current={view === name ? "page" : undefined}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                navigateView(name);
              }}
            >
              {label}
              {name === "research" && (research?.summary.problems ?? 0) > 0 ? (
                <span className="tab-count">{research?.summary.problems}</span>
              ) : null}
            </a>
          ))}
          <details className="labs-menu" open={LAB_VIEWS.some(({ name }) => name === view)}>
            <summary className={LAB_VIEWS.some(({ name }) => name === view) ? "tab active" : "tab"}>
              Labs
            </summary>
            <div>
              {LAB_VIEWS.map(({ name, label }) => (
                <a
                  key={name}
                  href={buildViewerHref(
                    currentLocation({ view: name }),
                    import.meta.env.BASE_URL,
                    LOCATION_DEFAULTS,
                  )}
                  className={view === name ? "active" : ""}
                  onClick={(event) => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    navigateView(name);
                  }}
                >
                  {label}
                </a>
              ))}
            </div>
          </details>
        </nav>

        <div className="rating-summary">
          <a href={`${import.meta.env.BASE_URL}api/v1/index.json`}>API</a>
          <a
            href={buildViewerHref(
              currentLocation({ view: "taste" }),
              import.meta.env.BASE_URL,
              LOCATION_DEFAULTS,
            )}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              navigateView("taste");
            }}
          >
            Taste · {Object.keys(ratings).length.toLocaleString()}
          </a>
        </div>
      </header>

      <main className={view === "evolution" || view === "islands" ? "graph-main" : ""}>
        {view === "browse" ? (
          <BrowseView
            domain={domain}
            index={featureIndex}
            settings={DEFAULT_SETTINGS}
            ratings={ratings}
            filters={filters}
            sort={sort}
            page={page}
            pageSize={pageSize}
            searchCandidateIds={searchCandidateIds}
            onFilters={updateFilters}
            onSort={updateSort}
            onPage={updatePage}
            onPageSize={updatePageSize}
            onOpen={(id) => openEntityForView(id)}
            onRate={rate}
          />
        ) : view === "recommendations" && featureIndex && tasteIndex ? (
          <RecommendationsView
            domain={domain}
            index={featureIndex}
            ratings={ratings}
            settings={DEFAULT_SETTINGS}
            tasteIndex={tasteIndex}
            onOpen={(id, context) => openEntityForView(id, context)}
            onRate={rate}
          />
        ) : view === "recommendations" ? (
          <DerivedViewState title="Recommendations" error={tasteIndexError} />
        ) : view === "evolution" ? (
          <EvolutionView
            domain={domain}
            ratings={ratings}
            onRate={rate}
            tasteIndex={tasteIndex}
            requestedTagId={requestedEvolutionTagId}
            onRequestedTagHandled={(id) =>
              setRequestedEvolutionTagId((current) => current === id ? null : current)
            }
            onOpen={(id) => openEntityForView(id)}
          />
        ) : view === "taste" ? (
          <TasteView
            domain={domain}
            ratings={ratings}
            productSnapshotId={catalog.productSnapshotId}
            tasteIndex={tasteIndex}
            onOpen={(id) => openEntityForView(id)}
            onOpenConcept={openConceptInEvolution}
            onRate={rate}
            onReplaceRatings={setRatings}
          />
        ) : view === "islands" && featureIndex && tasteIndex ? (
          <IslandsView
            domain={domain}
            index={featureIndex}
            ratings={ratings}
            settings={DEFAULT_SETTINGS}
            tasteIndex={tasteIndex}
            onOpen={(id) => openEntityForView(id)}
          />
        ) : view === "islands" ? (
          <DerivedViewState title="Islands" error={tasteIndexError} />
        ) : research ? (
          <ResearchView
            data={research}
            domain={domain}
            onOpen={(id) => openEntityForView(id)}
            onCompare={(leftId, rightId) => {
              void hydrateEntity(leftId).catch((cause: unknown) => console.warn(cause));
              void hydrateEntity(rightId).catch((cause: unknown) => console.warn(cause));
              openWindows([leftId, rightId]);
            }}
          />
        ) : (
          <DerivedViewState title="Research" error={researchError} />
        )}
      </main>

      <FloatingEntityWindows
        windows={windows}
        domain={domain}
        ratings={ratings}
        onRate={rate}
        onOpen={openEntityForView}
        imageHintsUrl={imageHintsUrl}
        imageHintProduct={imageHintProduct}
        onSearch={searchBrowse}
        onFocus={focusWindow}
        onClose={closeWindow}
        onMove={moveWindow}
      />
    </div>
  );
}
