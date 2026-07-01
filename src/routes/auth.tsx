import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Redirecting — Vrindavan Meals" }] }),
  component: AuthRedirect,
});

function AuthRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/login", replace: true });
  }, [navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-sm text-muted-foreground">Redirecting…</p>
    </div>
  );
}
