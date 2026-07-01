import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { UtensilsCrossed, Loader2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Login — Vrindavan Meals" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Signed in");
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[oklch(0.22_0.06_45)] text-[oklch(0.98_0.02_80)]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-[oklch(0.72_0.2_55)] opacity-40 blur-3xl" />
        <div className="absolute bottom-[-15rem] right-[-10rem] h-[600px] w-[600px] rounded-full bg-[oklch(0.6_0.18_25)] opacity-35 blur-3xl" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />

      <div className="relative z-10 min-h-screen grid place-items-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          <Link to="/" className="flex items-center gap-3 justify-center">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[oklch(0.78_0.2_65)] to-[oklch(0.6_0.22_35)] grid place-items-center shadow-lg shadow-black/30 ring-1 ring-white/20">
              <UtensilsCrossed className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight text-left">
              <div className="font-semibold text-lg tracking-tight">Vrindavan Meals</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/60">Canteen Portal</div>
            </div>
          </Link>

          <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl text-[oklch(0.98_0.02_80)] shadow-2xl shadow-black/40">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Welcome back</CardTitle>
              <CardDescription className="text-white/60">
                Sign in with your staff credentials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={signIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white/80">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-white/5 border-white/15 text-white placeholder:text-white/40 focus-visible:ring-white/40"
                    placeholder="you@vrindavanmeals.in"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white/80">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white/5 border-white/15 text-white placeholder:text-white/40 focus-visible:ring-white/40"
                    placeholder="••••••••"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 bg-white text-[oklch(0.28_0.08_45)] hover:bg-white/90 font-medium shadow-lg"
                  disabled={busy}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Login
                  {!busy && <ArrowRight className="h-4 w-4" />}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
