/**
 * PostgREST caps a single response at 1000 rows. Any query whose result feeds
 * an aggregate (totals, dues, GST, collection, attendance stats) MUST page
 * through the full set instead of taking the first page.
 *
 * Usage:
 *   const rows = await pageAll((from, to) => supabase.from("payments").select("amount").range(from, to));
 */
const PAGE = 1000;

export async function pageAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await run(from, from + PAGE - 1);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    if (from > 200_000) break; // hard safety stop
  }
  return out;
}
