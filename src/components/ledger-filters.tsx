import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LedgerStatus } from "@/lib/dues";

export type LedgerFilterState = {
  status: "all" | LedgerStatus;
  dueRange: "all" | "zero" | "low" | "high";
  sort: "due_desc" | "due_asc" | "name_asc" | "pay_new" | "pay_old";
};

export const defaultLedgerFilter: LedgerFilterState = {
  status: "all",
  dueRange: "all",
  sort: "due_desc",
};

type FilterableRow = {
  status: LedgerStatus;
  due_amount: number;
  full_name: string;
  last_payment_date: string | null;
};

export function applyLedgerFilter<T extends FilterableRow>(rows: T[], f: LedgerFilterState): T[] {
  const out = rows.filter((r) => {
    if (f.status !== "all" && r.status !== f.status) return false;
    if (f.dueRange === "zero" && r.due_amount > 0) return false;
    if (f.dueRange === "low" && !(r.due_amount >= 1 && r.due_amount <= 1000)) return false;
    if (f.dueRange === "high" && r.due_amount <= 1000) return false;
    return true;
  });
  const byPay = (r: FilterableRow) => (r.last_payment_date ? Date.parse(r.last_payment_date) : 0);
  out.sort((a, b) => {
    switch (f.sort) {
      case "due_asc": return a.due_amount - b.due_amount;
      case "name_asc": return a.full_name.localeCompare(b.full_name);
      case "pay_new": return byPay(b) - byPay(a);
      case "pay_old": return byPay(a) - byPay(b);
      default: return b.due_amount - a.due_amount;
    }
  });
  return out;
}

export function LedgerFilterControls({
  value,
  onChange,
}: {
  value: LedgerFilterState;
  onChange: (next: LedgerFilterState) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label className="text-xs">Status</Label>
        <Select value={value.status} onValueChange={(v) => onChange({ ...value, status: v as LedgerFilterState["status"] })}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Due</Label>
        <Select value={value.dueRange} onValueChange={(v) => onChange({ ...value, dueRange: v as LedgerFilterState["dueRange"] })}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any amount</SelectItem>
            <SelectItem value="zero">₹0 (Paid up)</SelectItem>
            <SelectItem value="low">₹1 – ₹1,000</SelectItem>
            <SelectItem value="high">₹1,000+</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Sort by</Label>
        <Select value={value.sort} onValueChange={(v) => onChange({ ...value, sort: v as LedgerFilterState["sort"] })}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="due_desc">Due (high → low)</SelectItem>
            <SelectItem value="due_asc">Due (low → high)</SelectItem>
            <SelectItem value="name_asc">Name (A → Z)</SelectItem>
            <SelectItem value="pay_new">Last payment (newest)</SelectItem>
            <SelectItem value="pay_old">Last payment (oldest)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
