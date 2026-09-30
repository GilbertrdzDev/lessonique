import Link from "next/link";
import type { ReactNode } from "react";

import { PrivacySettingsButton } from "@/components/privacy/privacy-settings";

type LegalPageProps = Readonly<{
  title: string;
  description: string;
  children: ReactNode;
}>;

export function LegalPage({ title, description, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="rounded-md text-base font-semibold tracking-tight text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            Lessonique
          </Link>

          <nav
            aria-label="Legal page navigation"
            className="flex flex-wrap items-center justify-end gap-1 sm:gap-2"
          >
            <LegalNavLink href="/">Back to classroom</LegalNavLink>
            <LegalNavLink href="/privacy">Privacy</LegalNavLink>
            <LegalNavLink href="/storage">Storage &amp; Analytics</LegalNavLink>
            <PrivacySettingsButton />
          </nav>
        </div>
      </header>

      <main className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_52%),radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--chart-2)_14%,transparent),transparent_48%)]"
        />

        <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <div className="mb-8 max-w-3xl">
            <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              Privacy information
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
              {description}
            </p>
          </div>

          <aside
            aria-labelledby="draft-policy-title"
            className="mb-10 rounded-2xl border border-warning/50 bg-warning/10 p-5 shadow-sm sm:p-6"
          >
            <p
              id="draft-policy-title"
              className="text-sm font-bold tracking-wide text-foreground uppercase"
            >
              Draft — not ready for publication
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This notice cannot be published as a final policy until the
              following operator details and the provider and minor wording
              have been reviewed.
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <DraftDetail label="Operator name" value="Pending — legal name required" />
              <DraftDetail
                label="Public privacy email"
                value="Pending — public email required"
              />
              <DraftDetail
                label="Operator country"
                value="Pending — country of establishment required"
              />
            </dl>
          </aside>

          <article className="space-y-10">{children}</article>
        </div>
      </main>

      <footer className="border-t border-border/80 bg-card/60">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>Lessonique privacy information</p>
          <p>Draft notice — operator details pending</p>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="rounded-2xl border border-border/80 bg-card/90 p-5 shadow-panel sm:p-7">
      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-[0.95rem] leading-7 text-muted-foreground sm:text-base">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-primary">{children}</ul>
  );
}

export function ExternalPolicyLink({
  href,
  children,
}: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-primary underline decoration-primary/35 underline-offset-4 transition-colors hover:decoration-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </a>
  );
}

function LegalNavLink({
  href,
  children,
}: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <Link
      href={href}
      className="rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
    >
      {children}
    </Link>
  );
}

function DraftDetail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-xl border border-warning/30 bg-background/65 p-3">
      <dt className="font-semibold text-foreground">{label}</dt>
      <dd className="mt-1 leading-5 text-muted-foreground">{value}</dd>
    </div>
  );
}
