import { describe, expect, it } from "vitest";
import {
  buildEntityPermalink,
  buildViewerHref,
  readEntityPermalink,
  readViewerLocation,
} from "./location";

const defaults = {
  pageSize: 50,
  pageSizeOptions: [25, 50, 100],
};

describe("viewer locations", () => {
  it("recognizes Taste as a first-class view", () => {
    const state = readViewerLocation(
      { pathname: "/arachne-demo/taste/", search: "" },
      "/arachne-demo/",
      defaults,
    );
    expect(state.view).toBe("taste");
    expect(buildViewerHref(state, "/arachne-demo/", defaults)).toBe(
      "/arachne-demo/taste/",
    );
  });

  it("hands static descriptors to a real interactive root view", () => {
    const state = readViewerLocation(
      { pathname: "/arachne-demo/", search: "?view=evolution" },
      "/arachne-demo/",
      defaults,
    );
    expect(state.view).toBe("evolution");
    expect(state.browse.filters.query).toBe("");
  });

  it("does not leak Research query parameters into a later Browse session", () => {
    const state = readViewerLocation(
      {
        pathname: "/arachne-demo/research/",
        search: "?q=merge&severity=problem",
      },
      "/arachne-demo/",
      defaults,
    );
    expect(state.view).toBe("research");
    expect(state.browse.filters.query).toBe("");
  });

  it("derives static-host-safe entity permalinks without product URLs", () => {
    const href = buildEntityPermalink(
      { family: "agent", id: "agent-000001" },
      "/arachne-demo/",
    );
    expect(href).toBe(
      "/arachne-demo/browse/#/agent/agent-000001",
    );
    expect(
      readEntityPermalink(
        "/arachne-demo/browse/",
        "/arachne-demo/",
        "#/agent/agent-000001",
      ),
    ).toEqual({ family: "agent", id: "agent-000001" });
  });

  it("rejects malformed and slash-bearing entity identifiers", () => {
    expect(
      readEntityPermalink(
        "/arachne-demo/browse/",
        "/arachne-demo/",
        "#/work/work%2Fescape",
      ),
    ).toBeNull();
    expect(
      readEntityPermalink(
        "/arachne-demo/work/id/extra/",
        "/arachne-demo/",
      ),
    ).toBeNull();
  });
});
