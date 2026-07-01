import { createFileRoute, Link } from "@tanstack/react-router";
import { UtensilsCrossed, ShieldCheck, Fingerprint, Printer, BarChart3, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vrindavan Meals — Canteen Management Portal" },
      { name: "description", content: "Subscription-based canteen management with biometric attendance, thermal token printing, and unit-level operations built for modern institutions." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[oklch(0.22_0.06_45)] text-[oklch(0.98_0.02_80)]">
      {/* Ambient gradient blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-[oklch(0.72_0.2_55)] opacity-40 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full bg-[oklch(0.65_0.22_35)] opacity-35 blur-3xl" />
        <div className="absolute bottom-[-15rem] left-1/3 h-[500px] w-[500px] rounded-full bg-[oklch(0.6_0.18_25)] opacity-30 blur-3xl" />
      </div>
      {/* Grid pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="border-b border-white/10 backdrop-blur-md bg-white/[0.03]">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[oklch(0.78_0.2_65)] to-[oklch(0.6_0.22_35)] grid place-items-center shadow-lg shadow-black/30 ring-1 ring-white/20">
                <UtensilsCrossed className="h-5 w-5 text-white" />
              </div>
              <div className="leading-tight">
                <div className="font-semibold text-lg tracking-tight">Vrindavan Meals</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/60">Canteen Portal</div>
              </div>
            </div>
            <Button
              asChild
              className="bg-white text-[oklch(0.28_0.08_45)] hover:bg-white/90 shadow-md font-medium"
            >
              <Link to="/auth">Login <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </header>

        <main className="flex-1">
          <section className="max-w-7xl mx-auto px-6 pt-20 pb-16 md:pt-28 md:pb-24">
            <div className="max-w-4xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.2_65)]" />
                Trusted by institutional canteens
              </span>
              <h1 className="mt-6 text-5xl md:text-7xl font-bold tracking-tight leading-[1.02]">
                Canteen management,{" "}
                <span className="bg-gradient-to-r from-[oklch(0.85_0.18_75)] via-[oklch(0.78_0.2_60)] to-[oklch(0.68_0.22_35)] bg-clip-text text-transparent">
                  reimagined.
                </span>
              </h1>
              <p className="mt-6 text-lg md:text-xl text-white/70 max-w-2xl leading-relaxed">
                Monthly subscriptions, face-biometric attendance, thermal token
                printing, and role-based operations — unified in one elegant portal.
              </p>
              <div className="mt-10 flex items-center gap-4">
                <Button
                  asChild
                  size="lg"
                  className="h-12 px-8 text-base bg-white text-[oklch(0.28_0.08_45)] hover:bg-white/90 shadow-xl shadow-black/20 font-medium"
                >
                  <Link to="/auth">Login <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <div className="text-sm text-white/60">Staff access only</div>
              </div>
            </div>
          </section>

          <section className="max-w-7xl mx-auto px-6 pb-24">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Fingerprint, title: "Face Biometric", desc: "Contactless attendance with instant meal verification." },
                { icon: Printer, title: "Token Printing", desc: "Thermal tokens generated the moment a student scans in." },
                { icon: ShieldCheck, title: "Role-Based Access", desc: "Fine-grained permissions across every operational role." },
                { icon: BarChart3, title: "Live Reporting", desc: "Unit-level insights on subscriptions, attendance, and revenue." },
              ].map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="group relative rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md transition hover:bg-white/[0.07] hover:border-white/20"
                >
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[oklch(0.78_0.2_65)] to-[oklch(0.6_0.22_35)] grid place-items-center shadow-lg shadow-black/20 ring-1 ring-white/15">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="mt-4 font-semibold text-base">{title}</div>
                  <div className="mt-1.5 text-sm text-white/60 leading-relaxed">{desc}</div>
                </div>
              ))}
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10 bg-black/20 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 py-6 text-center text-sm text-white/50">
            © {new Date().getFullYear()} Vrindavan Meals · Canteen Management Portal
          </div>
        </footer>
      </div>
    </div>
  );
}
