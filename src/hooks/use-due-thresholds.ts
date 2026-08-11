import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DueThresholds = { amount: number; days: number };

export const DEFAULT_DUE_THRESHOLDS: DueThresholds = { amount: 3000, days: 15 };

export const dueThresholdsQuery = {
  queryKey: ["due-thresholds"] as const,
  staleTime: 60_000,
  queryFn: async (): Promise<DueThresholds> => {
    const { data } = await supabase.from("system_settings").select("key,value");
    const map = Object.fromEntries((data ?? []).map((s) => [s.key, s.value])) as Record<string, string>;
    return {
      amount: Number(map["due_amount_threshold"] ?? DEFAULT_DUE_THRESHOLDS.amount),
      days: Number(map["days_overdue_threshold"] ?? DEFAULT_DUE_THRESHOLDS.days),
    };
  },
};

/** Single source of truth for the Settings → Billing Engine due-warning thresholds. */
export function useDueThresholds(): DueThresholds {
  const { data } = useQuery(dueThresholdsQuery);
  return data ?? DEFAULT_DUE_THRESHOLDS;
}
