import { writeAudit } from "./audit.functions";

export type AuditAction = "create" | "update" | "delete";

export type AuditEntity =
  | "payment"
  | "adjustment"
  | "holiday"
  | "subscription"
  | "fee_slab"
  | "biometric_mapping"
  | "security_deposit"
  | "billing";

export const ENTITY_LABEL: Record<AuditEntity, string> = {
  payment: "Payment",
  adjustment: "Adjustment",
  holiday: "Holiday Deduction",
  subscription: "Subscription",
  fee_slab: "Fee Slab",
  biometric_mapping: "Biometric Mapping",
  security_deposit: "Security Deposit",
  billing: "Billing",
};

export const ACTION_LABEL: Record<AuditAction, string> = {
  create: "Created",
  update: "Edited",
  delete: "Deleted",
};

type Values = Record<string, unknown> | null | undefined;

/**
 * Records an edit/delete/create into the Activity Log.
 * Never throws — an audit failure must not block the user's action.
 */
export async function logAudit(entry: {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  studentId?: string | null;
  label?: string | null;
  oldValues?: Values;
  newValues?: Values;
}): Promise<void> {
  try {
    await writeAudit({
      data: {
        action: entry.action,
        entity: entry.entity,
        entity_id: entry.entityId ?? null,
        student_id: entry.studentId ?? null,
        label: entry.label ?? null,
        old_values: entry.oldValues ?? null,
        new_values: entry.newValues ?? null,
      },
    });
  } catch {
    /* audit is best-effort */
  }
}

/** Only the fields that actually changed, as { field: { from, to } }. */
export function diffValues(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { old: Record<string, unknown>; new: Record<string, unknown> } {
  const oldV: Record<string, unknown> = {};
  const newV: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    if (String(a ?? "") !== String(b ?? "")) {
      oldV[key] = a ?? null;
      newV[key] = b ?? null;
    }
  }
  return { old: oldV, new: newV };
}
