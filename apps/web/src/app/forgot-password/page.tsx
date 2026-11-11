"use client";

import { apiRequest } from "@madeye/api-client";
import { Button } from "@madeye/ui";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="font-serif text-4xl">Reset password</h1>
      <p className="mt-3 text-sm text-ink/70">
        The request is accepted without revealing whether the email exists. No email is sent, and the reset token is not shown. Completing a password reset from this page is not implemented.
      </p>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const result = await apiRequest<{ delivery: string }>("/api/v1/auth/forgot-password", {
            method: "POST",
            body: JSON.stringify({ email: data.get("email") }),
          });
          setMessage(result.delivery === "not_configured" ? "Request stored. No email was sent." : "Request accepted. Email delivery is not implemented.");
        }}
      >
        <label className="block text-sm">
          Email
          <input className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2" name="email" type="email" required />
        </label>
        <Button type="submit">Request reset</Button>
        {message ? <p className="text-sm">{message}</p> : null}
      </form>
    </main>
  );
}
