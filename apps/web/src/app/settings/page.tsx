"use client";

import { apiRequest } from "@madeye/api-client";
import { Button } from "@madeye/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/shell";

interface Member { id: string; email: string; displayName: string; role: string; status: string }

export default function SettingsPage() {
  const client = useQueryClient();
  const members = useQuery({ queryKey: ["members"], queryFn: () => apiRequest<{ data: Member[] }>("/api/v1/members") });
  return (
    <Shell>
      <h1 className="font-serif text-4xl">Organisation</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/70">New members receive the password you set here. It is not emailed. Retention purge stays off until RETENTION_SWEEP_ENABLED is set on the worker.</p>
      <ul className="mt-6 space-y-2 text-sm">
        {(members.data?.data ?? []).map((member) => (
          <li key={member.id} className="rounded-md border border-line bg-panel px-3 py-2">{member.displayName} · {member.email} · {member.role} · {member.status}</li>
        ))}
      </ul>
      <form
        className="mt-6 grid max-w-md gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          await apiRequest("/api/v1/members", {
            method: "POST",
            body: JSON.stringify({
              email: data.get("email"),
              displayName: data.get("displayName"),
              password: data.get("password"),
              role: data.get("role"),
            }),
          });
          await client.invalidateQueries({ queryKey: ["members"] });
          event.currentTarget.reset();
        }}
      >
        <input name="displayName" required placeholder="Name" className="rounded-md border border-line bg-panel px-3 py-2 text-sm" />
        <input name="email" type="email" required placeholder="Email" className="rounded-md border border-line bg-panel px-3 py-2 text-sm" />
        <input name="password" type="password" required placeholder="Temporary password" className="rounded-md border border-line bg-panel px-3 py-2 text-sm" />
        <select name="role" className="rounded-md border border-line bg-panel px-3 py-2 text-sm">
          <option value="MEMBER">Member</option>
          <option value="ADMIN">Admin</option>
          <option value="REVIEWER">Reviewer</option>
        </select>
        <Button type="submit">Add member</Button>
      </form>
    </Shell>
  );
}
