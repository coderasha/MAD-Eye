import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="text-xs tracking-[0.22em] text-copper uppercase">MAD-EYE</p>
      <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-tight">Recognition you can trace back to a page.</h1>
      <p className="mt-6 max-w-2xl text-lg text-ink/80">
        Upload a document, keep the original, and inspect the preprocessing record. Text recognition is not available until a MAD-EYE model has weights and a measured evaluation. Nothing on this screen is a sample OCR result.
      </p>
      <div className="mt-8 flex gap-3">
        <Link className="rounded-md bg-copper px-4 py-2 text-sm text-paper" href="/login">
          Sign in
        </Link>
        <Link className="rounded-md border border-line bg-panel px-4 py-2 text-sm" href="/register">
          Create an organisation
        </Link>
      </div>
    </main>
  );
}
