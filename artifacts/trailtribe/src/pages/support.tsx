import { Link } from "wouter";
import { ArrowUpRight, Bike, Mail, MessageSquareWarning, Shield, UserRoundX } from "lucide-react";

const supportEmail = "admin@methowcyclingteam.com";

function SupportLink({ href, children, testId }: { href: string; children: React.ReactNode; testId: string }) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border-2 border-[#0a0c10] bg-primary px-4 py-2 text-sm font-extrabold text-primary-foreground shadow-cel-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {children}
    </Link>
  );
}

export default function SupportPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground" data-testid="page-support">
      <header className="border-b-2 border-[#0a0c10] bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/"
            data-testid="link-support-home"
            className="font-display text-3xl tracking-wider text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            TrailTeam
          </Link>
          <nav aria-label="Support navigation" className="flex items-center gap-4 text-sm font-bold">
            <Link href="/privacy" data-testid="link-support-privacy" className="min-h-11 inline-flex items-center hover:text-primary">Privacy</Link>
            <Link href="/terms" data-testid="link-support-terms" className="min-h-11 inline-flex items-center hover:text-primary">Terms</Link>
            <Link href="/sign-in" data-testid="link-support-sign-in" className="min-h-11 inline-flex items-center text-primary underline underline-offset-4">Sign in</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <section className="relative overflow-hidden rounded-xl border-2 border-[#0a0c10] bg-card shadow-cel">
          <div aria-hidden="true" className="absolute -right-8 -top-10 h-48 w-48 rotate-12 border-[18px] border-primary/10 sm:h-64 sm:w-64" />
          <div className="relative border-b-2 border-[#0a0c10] bg-secondary px-6 py-8 sm:px-10 sm:py-11">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary" data-testid="text-support-eyebrow">TrailTeam help desk</p>
            <h1 className="mt-3 max-w-2xl font-display text-6xl leading-[0.9] tracking-wide sm:text-7xl">Need a hand?</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground" data-testid="text-support-intro">
              For account access, team coordination, or a concern about the Board, reach the Methow Cycling Team admins.
            </p>
            <a
              href={`mailto:${supportEmail}`}
              data-testid="link-support-email-hero"
              className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-lg border-2 border-[#0a0c10] bg-primary px-5 text-sm font-extrabold text-primary-foreground shadow-cel cel-interactive"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              Email team admins
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <p className="mt-3 text-sm font-semibold text-muted-foreground">{supportEmail}</p>
          </div>

          <div className="grid gap-0 md:grid-cols-[0.85fr_1.15fr]">
            <div className="border-b-2 border-[#0a0c10] bg-primary/10 p-6 sm:p-8 md:border-b-0 md:border-r-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-[#0a0c10] bg-card shadow-cel-sm">
                <Bike className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <h2 className="mt-5 font-display text-3xl tracking-wide">A real team, real people</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                TrailTeam supports families, riders, coaches, and administrators in a high-school mountain-bike program. Support is handled by the team's coaches and admins, who are volunteers, so replies may take a little time. For anything urgent, email the team admins.
              </p>
              <a href={`mailto:${supportEmail}`} data-testid="link-support-email" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-primary underline decoration-primary/50 underline-offset-4">
                Contact an admin <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>

            <div className="space-y-7 p-6 sm:p-8">
              <div className="flex gap-4">
                <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-[#0a0c10] bg-accent/20">
                  <MessageSquareWarning className="h-5 w-5 text-foreground" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-extrabold">Report a Board post</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    While signed in, open a discussion or reply, choose Report from its actions menu, select a reason, and send it with optional details. Coaches and admins can review reports. Coaches review reports as soon as they can, and reports of harassment or safety concerns are handled first. For anything urgent, email the team admins.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-[#0a0c10] bg-card">
                  <UserRoundX className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-extrabold">Hide a member</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Members can hide or unhide other Board members in their own view. Hiding changes your Board experience; it does not submit a report or block that person from posting. If a member breaks the community rules, coaches and admins can remove their content or restrict their ability to post on the Board.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-[#0a0c10] bg-card">
                  <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-extrabold">Account and access choices</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Account deletion is available in the app under Profile settings. Posting restrictions apply only to creating Board discussions and replies; they do not prevent other app activity.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-7 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border-2 border-[#0a0c10] bg-card p-5 shadow-cel-sm sm:p-6" data-testid="support-account-card">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Account help</p>
            <h2 className="mt-2 text-lg font-extrabold">Manage your account yourself</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              In the signed-in app, open Profile settings to make account changes or start permanent account deletion. The deletion flow asks you to confirm before it proceeds.
            </p>
            <SupportLink href="/sign-in" testId="link-support-sign-in-account">Sign in to TrailTeam</SupportLink>
          </div>
          <div className="rounded-xl border-2 border-[#0a0c10] bg-card p-5 shadow-cel-sm sm:p-6" data-testid="support-policies-card">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Know the details</p>
            <h2 className="mt-2 text-lg font-extrabold">Community rules and privacy</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Read how Board reports and hidden-member preferences work, what respectful participation means, and which account choices are available.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <SupportLink href="/terms" testId="link-support-read-terms">Terms of Service</SupportLink>
              <Link href="/privacy" data-testid="link-support-read-privacy" className="inline-flex min-h-11 items-center px-2 text-sm font-extrabold text-primary underline underline-offset-4">Privacy Policy</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-[#0a0c10] bg-card">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p data-testid="text-support-footer">© 2026 TrailTeam · Methow Cycling Team</p>
          <nav aria-label="Support footer links" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacy" data-testid="link-support-footer-privacy" className="font-bold hover:text-primary">Privacy</Link>
            <Link href="/terms" data-testid="link-support-footer-terms" className="font-bold hover:text-primary">Terms</Link>
            <a href={`mailto:${supportEmail}`} data-testid="link-support-footer-email" className="font-bold hover:text-primary">Email support</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
