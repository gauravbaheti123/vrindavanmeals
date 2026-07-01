import { createFileRoute, Link } from "@tanstack/react-router";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vrindavan Meals — Canteen Management Portal" },
      { name: "description", content: "Subscription-based canteen management with biometric attendance, token printing, and unit-level operations." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <span className="font-semibold text-lg">Vrindavan Meals</span>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost"><Link to="/register">Student Registration</Link></Button>
            <Button asChild><Link to="/auth">Staff Sign in</Link></Button>
          </div>
        </div>
      </header>

      <main className="flex-1 grid place-items-center px-6 py-16">
        <div className="max-w-3xl text-center space-y-6">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground">
            Canteen Management,<br />built for two units.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Monthly subscriptions, face-biometric attendance, thermal token printing,
            and role-based operations — all in one portal.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-4">
            <Button asChild size="lg"><Link to="/auth">Staff Sign in</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/register">Register as Student</Link></Button>
          </div>
        </div>
      </main>

      <footer className="border-t bg-card text-center py-6 text-sm text-muted-foreground">
        © {new Date().getFullYear()} Vrindavan Meals
      </footer>
    </div>
  );
}
