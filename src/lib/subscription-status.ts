import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["subscription_status"];

export type EffectiveStatus = "pending" | "active" | "grace" | "expired";

export function computeSubscriptionStatus(sub: {
  status: Status;
  end_date: string;
  grace_end_date: string;
}): EffectiveStatus {
  if (sub.status === "pending") return "pending";
  const today = new Date().toISOString().slice(0, 10);
  if (today <= sub.end_date) return "active";
  if (today <= sub.grace_end_date) return "grace";
  return "expired";
}

export const STATUS_STYLES: Record<EffectiveStatus, string> = {
  active: "bg-success text-success-foreground",
  grace: "bg-warning text-warning-foreground",
  expired: "bg-destructive text-destructive-foreground",
  pending: "bg-muted text-muted-foreground",
};

export const STATUS_LABEL: Record<EffectiveStatus, string> = {
  active: "Active",
  grace: "Grace",
  expired: "Expired",
  pending: "Pending",
};
