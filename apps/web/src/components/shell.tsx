"use client";

import { apiRequest } from "@madeye/api-client";
import Link from "next/link";
import { useSession } from "@/lib/session";

const links = [
  ["/overview", "Overview"],
  ["/documents", "Documents"],
  ["/reviews", "Review"],
  ["/models", "Models"],
  ["/api-keys", "API keys"],
  ["/settings", "Settings"],
  ["/capabilities", "Capabilities"],
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  if (loading) return <p className="p-8 text-sm">Checking session…</p>;
  if (!session) return <p className="p-8 text-sm">Sign-in required.</p>;
  return (
      <div className="min-h-screen lg:grid lg:grid-cols-[220px_1fr]">
        <aside className="border-b border-line bg-panel px-4 py-6 lg:border-r lg:border-b-0">
          <p className="font-serif text-xl">MAD-EYE</p>
          <p className="mt-1 text-xs text-ink/60">{session.tenant.organizationName}</p>
          <nav className="mt-6 flex flex-wrap gap-2 lg:flex-col">
            {links.map(([href, label]) => (
              <Link key={href} href={href} className="rounded px-2 py-1 text-sm hover:bg-paper">
                {label}
              </Link>
            ))}
          </nav>
          <button
            className="mt-6 text-sm underline"
            onClick={async () => {
              await apiRequest("/api/v1/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            Sign out
          </button>
        </aside>
        <div className="px-6 py-8">{children}</div>
      </div>
  );
}
