import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StudentOption {
  id: string;
  full_name: string;
  mobile: string;
  roll_number: string | null;
  unit_id: string | null;
}

export function StudentPicker({
  value,
  onChange,
  placeholder = "Select student…",
}: {
  value: StudentOption | null;
  onChange: (s: StudentOption | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data: students } = useQuery({
    queryKey: ["students-picker", q],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("id, full_name, mobile, roll_number, unit_id")
        .eq("is_approved", true)
        .is("exit_date", null)
        .order("roll_number")
        .limit(50);
      if (q) query = query.or(`full_name.ilike.%${q}%,mobile.ilike.%${q}%,roll_number.ilike.%${q}%`);
      const { data } = await query;
      return (data ?? []) as StudentOption[];
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          {value ? (
            <span className="truncate">{value.full_name} <span className="text-muted-foreground">· {value.roll_number ?? "—"}</span></span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] pointer-events-auto" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by Mess No or name" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>No students found.</CommandEmpty>
            <CommandGroup>
              {students?.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.id}
                  onSelect={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4 mr-2", value?.id === s.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span>{s.full_name}</span>
                    <span className="text-xs text-muted-foreground">{s.roll_number ?? "—"}{s.mobile ? ` · ${s.mobile}` : ""}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
