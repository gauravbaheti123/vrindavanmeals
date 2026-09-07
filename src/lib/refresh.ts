import type { QueryClient } from "@tanstack/react-query";

/** Re-fetch every query currently rendered on screen. */
export async function refreshActiveQueries(qc: QueryClient) {
  await qc.refetchQueries({ type: "active" });
}
