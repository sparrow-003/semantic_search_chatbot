import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

describe("App routing", () => {
  it("matches all workspace routes instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const paths = [
      "/",
      "/search",
      "/dashboards",
      "/dashboards/11111111-1111-4111-8111-111111111111",
      "/workspace",
      "/admin",
      "/auth",
      "/auth/reset",
      "/profile",
    ];
    for (const path of paths) {
      const matches = router.matchRoutes(path);
      expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    }
  });
});
