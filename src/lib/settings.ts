import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  recommendation: {
    limit: 100,
  },
  islands: {
    maxRecommendationNodes: 120,
    maxInferredNeighborsPerNode: 6,
    maxEdges: 400,
    minimumSimilarity: 0.12,
  },
  browse: {
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
  },
};
