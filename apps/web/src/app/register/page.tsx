"use client";

import { apiRequest } from "@madeye/api-client";
import { Button } from "@madeye/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorText } from "@/lib/session";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="font-serif text-4xl">Create an organisation</h1>
      <p className="mt-3 text-sm text-ink/70">The first account becomes the owner of a new tenant. Passwords need 12 characters, a letter, and a digit.</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          try {
            await apiRequest("/api/v1/auth/register", {
              method: "POST",
              body: JSON.stringify({
                email: data.get("email"),
                password: data.get("password"),
                displayName: data.get("displayName"),
                organizationName: data.get("organizationName"),
              }),
            });
            router.push("/overview");
          } catch (caught) {
            setError(errorText(caught));
          }
        }}
      >
        <Field name="organizationName" label="Organisation" />
        <Field name="displayName" label="Your name" />
        <Field name="email" label="Email" type="email" />
        <Field name="password" label="Password" type="password" />
        {error ? <p className="text-sm text-copper">{error}</p> : null}
        <Button type="submit">Create</Button>
      </form>
    </main>
  );
}

function Field({ name, label, type = "text" }: { name: string; label: string; type?: string }) {
  return (
    <label className="block text-sm">
      {label}
      <input className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2" name={name} type={type} required />
    </label>
  );
}
