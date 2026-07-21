import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Minus, X, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({ meta: [{ title: "POS — Vrindavan Meals" }] }),
  component: POSPage,
});

interface Category { id: string; name: string; sort_order: number; is_active: boolean }
interface Item { id: string; name: string; category_id: string | null; price: number; is_active: boolean }
interface PayMode { id: string; label: string; is_active: boolean; sort_order: number }
interface CartLine { item_id: string; item_name: string; unit_price: number; quantity: number }

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

// Bypass generated types until regen
const db = supabase as unknown as {
  from: (t: string) => ReturnType<typeof supabase.from>;
};

function POSPage() {
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountType, setDiscountType] = useState<"none" | "percentage" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState<string>("0");
  const [paymentMode, setPaymentMode] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["pos-cats"],
    queryFn: async () => ((await db.from("pos_categories").select("*").eq("is_active", true).order("sort_order")).data ?? []) as unknown as Category[],
  });
  const { data: items = [] } = useQuery({
    queryKey: ["pos-items"],
    queryFn: async () => ((await db.from("pos_items").select("*").eq("is_active", true).order("name")).data ?? []) as unknown as Item[],
  });
  const { data: modes = [] } = useQuery({
    queryKey: ["pos-modes"],
    queryFn: async () => ((await db.from("pos_payment_modes").select("*").eq("is_active", true).order("sort_order")).data ?? []) as unknown as PayMode[],
  });
  const { data: settings } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("key,value");
      return Object.fromEntries((data ?? []).map((s) => [s.key, s.value])) as Record<string, string>;
    },
  });

  const taxRate = Number(settings?.pos_tax_rate ?? 0);

  const itemCountByCat = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach((i) => { if (i.category_id) map[i.category_id] = (map[i.category_id] ?? 0) + 1; });
    return map;
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (categoryId !== "all" && i.category_id !== categoryId) return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, categoryId, search]);

  const cartQtyById = useMemo(() => {
    const m: Record<string, number> = {};
    cart.forEach((l) => { m[l.item_id] = l.quantity; });
    return m;
  }, [cart]);

  const addToCart = (item: Item) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.item_id === item.id);
      if (existing) return prev.map((l) => l.item_id === item.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { item_id: item.id, item_name: item.name, unit_price: Number(item.price), quantity: 1 }];
    });
  };
  const changeQty = (id: string, delta: number) => {
    setCart((prev) => prev.flatMap((l) => {
      if (l.item_id !== id) return [l];
      const q = l.quantity + delta;
      return q <= 0 ? [] : [{ ...l, quantity: q }];
    }));
  };
  const removeLine = (id: string) => setCart((prev) => prev.filter((l) => l.item_id !== id));
  const clearCart = () => { setCart([]); setDiscountType("none"); setDiscountValue("0"); };

  const subtotal = cart.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const discountAmount = discountType === "percentage"
    ? Math.min(subtotal, subtotal * (Number(discountValue) || 0) / 100)
    : discountType === "fixed"
      ? Math.min(subtotal, Number(discountValue) || 0)
      : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxAmount = afterDiscount * (taxRate / 100);
  const total = afterDiscount + taxAmount;

  async function completeSale() {
    if (cart.length === 0) return toast.error("Cart is empty");
    if (!paymentMode) return toast.error("Select payment mode");
    setSaving(true);
    const { data: sale, error } = await db.from("pos_sales").insert({
      subtotal, discount_type: discountType, discount_value: Number(discountValue) || 0,
      discount_amount: discountAmount, tax_rate: taxRate, tax_amount: taxAmount,
      total, payment_mode: paymentMode,
    }).select("id, sale_number").single();
    if (error || !sale) { setSaving(false); return toast.error(error?.message ?? "Sale failed"); }
    const saleRow = sale as unknown as { id: string; sale_number: number };
    const lines = cart.map((l) => ({
      sale_id: saleRow.id, item_id: l.item_id, item_name: l.item_name,
      unit_price: l.unit_price, quantity: l.quantity, line_total: l.unit_price * l.quantity,
    }));
    const { error: liErr } = await db.from("pos_sale_items").insert(lines);
    setSaving(false);
    if (liErr) return toast.error(liErr.message);
    toast.success(`Sale #${saleRow.sale_number} completed`);
    printReceipt(saleRow.sale_number, cart, subtotal, discountAmount, taxRate, taxAmount, total, paymentMode);
    clearCart();
    qc.invalidateQueries({ queryKey: ["pos-sales"] });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_360px] gap-4 h-[calc(100vh-8rem)]">
      {/* LEFT — categories */}
      <Card className="p-2 overflow-y-auto">
        <div className="text-xs uppercase font-semibold text-muted-foreground px-2 py-2">Categories</div>
        <button
          onClick={() => setCategoryId("all")}
          className={cn("w-full flex items-center justify-between px-3 py-2 rounded-md text-sm mb-1",
            categoryId === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
        >
          <span>All</span><Badge variant="secondary">{items.length}</Badge>
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryId(c.id)}
            className={cn("w-full flex items-center justify-between px-3 py-2 rounded-md text-sm mb-1",
              categoryId === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            <span>{c.name}</span><Badge variant="secondary">{itemCountByCat[c.id] ?? 0}</Badge>
          </button>
        ))}
      </Card>

      {/* MIDDLE — items */}
      <div className="flex flex-col min-h-0">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pr-1">
          {filteredItems.map((it) => {
            const qty = cartQtyById[it.id];
            return (
              <button
                key={it.id}
                onClick={() => addToCart(it)}
                className="relative border rounded-lg p-3 text-left hover:border-primary hover:shadow-md transition bg-card"
              >
                {qty ? (
                  <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs h-6 min-w-6 px-1 rounded-full grid place-items-center font-bold shadow">{qty}</span>
                ) : null}
                <div className="font-medium text-sm line-clamp-2">{it.name}</div>
                <div className="text-primary font-semibold mt-2">{inr(Number(it.price))}</div>
              </button>
            );
          })}
          {filteredItems.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-12">No items.</div>
          )}
        </div>
      </div>

      {/* RIGHT — cart */}
      <Card className="flex flex-col min-h-0">
        <div className="p-3 border-b">
          <div className="font-semibold">Walk-in Sale</div>
          <div className="text-xs text-muted-foreground">Cash counter — direct sale</div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">Tap items to add.</div>
          ) : cart.map((l) => (
            <div key={l.item_id} className="border rounded-md p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium flex-1">{l.item_name}</div>
                <button onClick={() => removeLine(l.item_id)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(l.item_id, -1)}><Minus className="h-3 w-3" /></Button>
                  <div className="w-8 text-center text-sm font-medium">{l.quantity}</div>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(l.item_id, 1)}><Plus className="h-3 w-3" /></Button>
                </div>
                <div className="text-sm font-semibold">{inr(l.unit_price * l.quantity)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t p-3 space-y-2 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{inr(subtotal)}</span></div>
          <div className="flex items-center gap-2">
            <Select value={discountType} onValueChange={(v) => setDiscountType(v as typeof discountType)}>
              <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No disc.</SelectItem>
                <SelectItem value="percentage">% off</SelectItem>
                <SelectItem value="fixed">₹ off</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number" className="h-8" disabled={discountType === "none"}
              value={discountValue} onChange={(e) => setDiscountValue(e.target.value)}
            />
            <div className="text-right w-20 text-muted-foreground">−{inr(discountAmount)}</div>
          </div>
          <div className="flex justify-between text-muted-foreground"><span>Tax ({taxRate}%)</span><span>{inr(taxAmount)}</span></div>
          <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total</span><span>{inr(total)}</span></div>
          <Select value={paymentMode} onValueChange={setPaymentMode}>
            <SelectTrigger><SelectValue placeholder="Payment mode" /></SelectTrigger>
            <SelectContent>
              {modes.map((m) => <SelectItem key={m.id} value={m.label}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="w-full" onClick={completeSale} disabled={saving || cart.length === 0}>
            <Printer className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Complete Sale & Print"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={clearCart} disabled={cart.length === 0}>
            <Trash2 className="h-4 w-4 mr-2" />Clear Cart
          </Button>
        </div>
      </Card>
    </div>
  );
}

function printReceipt(
  saleNumber: number, lines: CartLine[], subtotal: number, discount: number,
  taxRate: number, tax: number, total: number, mode: string,
) {
  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) return;
  const rows = lines.map((l) => `
    <tr><td>${l.item_name}<br/><span style="font-size:10px">${l.quantity} × ₹${l.unit_price.toFixed(2)}</span></td>
    <td style="text-align:right">₹${(l.unit_price * l.quantity).toFixed(2)}</td></tr>
  `).join("");
  w.document.write(`
<html><head><title>Receipt #${saleNumber}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: monospace; font-size: 12px; width: 72mm; }
  h2 { text-align:center; margin:0 0 4px; }
  table { width:100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  .line { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display:flex; justify-content:space-between; }
  .total { font-size: 14px; font-weight: bold; }
</style></head><body>
<h2>Vrindavan Meals</h2>
<div style="text-align:center">Walk-in Sale</div>
<div class="line"></div>
<div class="row"><span>Bill #${saleNumber}</span><span>${new Date().toLocaleString("en-IN")}</span></div>
<div class="line"></div>
<table>${rows}</table>
<div class="line"></div>
<div class="row"><span>Subtotal</span><span>₹${subtotal.toFixed(2)}</span></div>
${discount > 0 ? `<div class="row"><span>Discount</span><span>−₹${discount.toFixed(2)}</span></div>` : ""}
${tax > 0 ? `<div class="row"><span>Tax (${taxRate}%)</span><span>₹${tax.toFixed(2)}</span></div>` : ""}
<div class="row total"><span>TOTAL</span><span>₹${total.toFixed(2)}</span></div>
<div class="line"></div>
<div class="row"><span>Paid via</span><span>${mode}</span></div>
<div class="line"></div>
<div style="text-align:center;margin-top:6px">Thank you!</div>
<script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };</script>
</body></html>
  `);
  w.document.close();
}
