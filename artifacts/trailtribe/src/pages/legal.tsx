import { useEffect } from "react";
import { Link } from "wouter";

const siteUrl = "https://trailteam.app";
const effectiveDate = "August 26, 2026";

type LegalPageKind = "privacy" | "terms";

type LegalPageProps = {
  page: LegalPageKind;
};

type Metadata = {
  title: string;
  description: string;
  path: string;
};

const pageMetadata: Record<LegalPageKind, Metadata> = {
  privacy: {
    title: "Privacy Policy | TrailTeam",
    description:
      "Read TrailTeam’s Privacy Policy to learn how our high school mountain bike team uses contact, health, account, and activity information to operate team programs safely.",
    path: "/privacy",
  },
  terms: {
    title: "Terms of Service | TrailTeam",
    description:
      "Read TrailTeam’s Terms of Service for the account, communication, event, transportation, safety, and team-management rules that apply when using TrailTeam.",
    path: "/terms",
  },
};

function setMeta(selector: string, content: string) {
  const element = document.head.querySelector<HTMLMetaElement>(selector);
  const previousContent = element?.content;

  if (element) {
    element.content = content;
  }

  return () => {
    if (element && previousContent !== undefined) {
      element.content = previousContent;
    }
  };
}

function useLegalMetadata(page: LegalPageKind) {
  useEffect(() => {
    const metadata = pageMetadata[page];
    const previousTitle = document.title;
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previousCanonical = canonical?.href;

    document.title = metadata.title;
    if (canonical) {
      canonical.href = `${siteUrl}${metadata.path}`;
    }

    const restoreDescription = setMeta('meta[name="description"]', metadata.description);
    const restoreOgTitle = setMeta('meta[property="og:title"]', metadata.title);
    const restoreOgDescription = setMeta('meta[property="og:description"]', metadata.description);
    const restoreOgUrl = setMeta('meta[property="og:url"]', `${siteUrl}${metadata.path}`);
    const restoreTwitterTitle = setMeta('meta[name="twitter:title"]', metadata.title);
    const restoreTwitterDescription = setMeta(
      'meta[name="twitter:description"]',
      metadata.description,
    );

    return () => {
      document.title = previousTitle;
      if (canonical && previousCanonical) {
        canonical.href = previousCanonical;
      }
      restoreDescription();
      restoreOgTitle();
      restoreOgDescription();
      restoreOgUrl();
      restoreTwitterTitle();
      restoreTwitterDescription();
    };
  }, [page]);
}

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`section-${title.toLowerCase().replaceAll(" ", "-")}`}>
      <h2
        id={`section-${title.toLowerCase().replaceAll(" ", "-")}`}
        className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl"
      >
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[0.98rem] leading-7 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function InlineLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-bold text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {children}
    </Link>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <p>
        TrailTeam helps a high school mountain bike team coordinate its season, communicate with
        families, and support rider safety. This Privacy Policy explains what information we use,
        why we use it, and the choices available to you.
      </p>

      <LegalSection title="Information we collect">
        <p>We collect information that families, riders, coaches, and administrators provide while using TrailTeam, including:</p>
        <ul className="list-disc space-y-2 pl-5 marker:text-primary">
          <li>
            <strong className="text-foreground">Contact and household information:</strong> names,
            email addresses, phone numbers, and home addresses.
          </li>
          <li>
            <strong className="text-foreground">Emergency contacts:</strong> names and contact
            details for people who may be contacted about a rider.
          </li>
          <li>
            <strong className="text-foreground">Rider information:</strong> date of birth and
            other roster details needed to organize participation.
          </li>
          <li>
            <strong className="text-foreground">Sensitive health information:</strong> allergies,
            medications, and medical notes that a family chooses to provide for rider safety.
          </li>
          <li>
            <strong className="text-foreground">Account and authentication information:</strong>{" "}
            Clerk-managed user IDs and the account information needed to sign in. Clerk manages
            authentication credentials; TrailTeam does not store account passwords itself.
          </li>
          <li>
            <strong className="text-foreground">Team activity information:</strong> event
            responses, carpool coordination, volunteer commitments, team messages, document
            acknowledgements, and files or notes submitted through the service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How we use information">
        <p>
          We use information to create and manage accounts, maintain the team roster, organize
          events and attendance, coordinate transportation and volunteer tasks, send team
          communications, manage required documents, and respond to family questions.
        </p>
        <p>
          Health information is used only to support participation and safety planning. It is
          available only to authorized coaches and administrators who need it for those purposes.
        </p>
      </LegalSection>

      <LegalSection title="How information is shared">
        <p>
          Information is shared within TrailTeam only as needed for the relevant feature and team
          role. For example, authorized coaches and administrators can access roster and safety
          information, while families and riders see the information available to their own
          accounts and team activities.
        </p>
        <p>
          We use service providers to operate TrailTeam: Clerk provides account authentication;
          Replit provides application hosting, database services, and file storage; and Gmail is
          used to send team email. These providers process information only to provide their
          services to TrailTeam. Information may also be disclosed when needed to protect people
          from harm or to meet a legal obligation.
        </p>
      </LegalSection>

      <LegalSection title="Permissions we do not use">
        <p>
          TrailTeam does not currently request or use access to your camera, photo library,
          precise location, or coarse location. The app does not include camera, photo-library,
          or geolocation features.
        </p>
      </LegalSection>

      <LegalSection title="Retention, access, and deletion">
        <p>
          We keep information while it is needed to operate the team, maintain required
          participation records, resolve issues, or meet applicable obligations. You can ask to
          review or correct your household information through TrailTeam or by contacting us.
        </p>
        <p>
          To request deletion of an account or household information, contact us using the address
          below. Some information may need to be retained for safety, compliance, insurance, or
          recordkeeping purposes.
        </p>
      </LegalSection>

      <LegalSection title="Children and family accounts">
        <p>
          TrailTeam is intended for a youth cycling program. Parents or guardians are responsible
          for providing and keeping family and rider information accurate, and should contact us
          with questions about a young person’s information.
        </p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>
          We may update this policy when TrailTeam or team practices change. We will post the
          updated policy here and change the effective date. For privacy questions, corrections,
          or deletion requests, email{" "}
          <a
            href="mailto:admin@methowcyclingteam.com"
            className="font-bold text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            admin@methowcyclingteam.com
          </a>
          .
        </p>
      </LegalSection>
    </>
  );
}

function TermsOfService() {
  return (
    <>
      <p>
        These Terms of Service explain the expectations for using TrailTeam to participate in and
        support the team. By creating an account or using TrailTeam, you agree to these terms.
      </p>

      <LegalSection title="Accounts and roles">
        <p>
          TrailTeam accounts are for team members, parents or guardians, riders, coaches, and
          administrators. You are responsible for providing accurate information, keeping account
          access secure, and promptly updating changes to contact, emergency, and rider details.
        </p>
        <p>
          Parents and guardians are responsible for managing their household information and for
          supervising minor riders’ use of TrailTeam. Coaches and administrators have additional
          responsibilities to handle team information appropriately.
        </p>
      </LegalSection>

      <LegalSection title="Team communication and participation">
        <p>
          TrailTeam may be used for event details, attendance responses, transportation
          coordination, volunteer commitments, required documents, and team messages. Keep your
          responses current so the team can plan safely and communicate effectively.
        </p>
        <p>
          Carpool information is provided to help families coordinate transportation. Each family
          remains responsible for its own transportation decisions, drivers, vehicles, riders, and
          required permissions.
        </p>
      </LegalSection>

      <LegalSection title="Health and safety information">
        <p>
          Families are responsible for providing accurate, current allergies, medications, medical
          notes, emergency contacts, and other safety information relevant to participation.
          TrailTeam helps the team organize this information, but it is not a medical service and
          does not provide medical advice or emergency care.
        </p>
        <p>
          Cycling and team activities involve inherent risks. These terms do not replace any
          separate liability waiver, media release, code of conduct, or other participation
          document required by the team.
        </p>
      </LegalSection>

      <LegalSection title="Respectful and permitted use">
        <p>
          Use TrailTeam respectfully and only for legitimate team purposes. Do not share someone
          else’s account, attempt to access information you are not authorized to view, upload
          harmful or unlawful content, interfere with the service, or use team contact information
          for unrelated commercial, political, or personal purposes.
        </p>
      </LegalSection>

      <LegalSection title="Content and privacy">
        <p>
          You are responsible for the information, messages, files, and updates you submit.
          TrailTeam may use that content to operate the requested team feature. Handle other
          families’ information with care and do not redistribute private roster, health, contact,
          transportation, or team-message information outside the team.
        </p>
      </LegalSection>

      <LegalSection title="Service availability and account changes">
        <p>
          We work to keep TrailTeam available and accurate, but the service may be changed,
          interrupted, or unavailable at times. We may limit, suspend, or remove access when
          needed to protect the team, participants, the service, or other users, or when these
          terms are not followed.
        </p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>
          We may update these terms as TrailTeam and team practices change. We will post the
          updated terms here and change the effective date. Questions about these terms can be
          sent to{" "}
          <a
            href="mailto:admin@methowcyclingteam.com"
            className="font-bold text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            admin@methowcyclingteam.com
          </a>
          .
        </p>
      </LegalSection>
    </>
  );
}

export default function LegalPage({ page }: LegalPageProps) {
  useLegalMetadata(page);

  const isPrivacyPolicy = page === "privacy";
  const title = isPrivacyPolicy ? "Privacy Policy" : "Terms of Service";
  const summary = isPrivacyPolicy
    ? "How TrailTeam handles family, rider, and account information."
    : "The rules for using TrailTeam to support the team.";

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b-2 border-[#0a0c10] bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link
            href="/"
            className="font-display text-3xl tracking-wider text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            TrailTeam
          </Link>
          <nav aria-label="Legal pages" className="flex items-center gap-4 text-sm font-bold">
            <InlineLink href="/privacy">Privacy</InlineLink>
            <InlineLink href="/terms">Terms</InlineLink>
            <InlineLink href="/sign-in">Sign in</InlineLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <article className="overflow-hidden rounded-xl border-2 border-[#0a0c10] bg-card shadow-cel">
          <div className="border-b-2 border-[#0a0c10] bg-secondary px-6 py-7 sm:px-9 sm:py-9">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
              TrailTeam legal information
            </p>
            <h1 className="mt-2 font-display text-5xl leading-none tracking-wide text-foreground sm:text-6xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{summary}</p>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Effective {effectiveDate}
            </p>
          </div>

          <div className="space-y-10 px-6 py-8 sm:px-9 sm:py-10">
            {isPrivacyPolicy ? <PrivacyPolicy /> : <TermsOfService />}
          </div>
        </article>
      </main>

      <footer className="border-t-2 border-[#0a0c10] bg-card">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© 2026 TrailTeam</p>
          <nav aria-label="Footer legal pages" className="flex gap-4">
            <InlineLink href="/privacy">Privacy Policy</InlineLink>
            <InlineLink href="/terms">Terms of Service</InlineLink>
          </nav>
        </div>
      </footer>
    </div>
  );
}