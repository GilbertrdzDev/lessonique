import type { Metadata } from "next";

import {
  ExternalPolicyLink,
  LegalList,
  LegalPage,
  LegalSection,
} from "@/components/privacy/legal-page";

export const metadata: Metadata = {
  title: "Privacy Notice | Lessonique",
  description:
    "Draft information about how Lessonique handles classroom, browser, analytics, and provider data.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Notice"
      description="How the current Lessonique classroom handles information in your browser and when it interacts with hosting, analytics, WebMCP, and runtime providers."
    >
      <LegalSection title="Who is responsible">
        <p>
          Lessonique is responsible for the product choices described in this
          draft. The operator&apos;s legal name, public privacy email, and country
          are publication prerequisites and remain pending above. Until those
          details and the provider and minor wording have been reviewed, this
          page is product information rather than a final published privacy
          policy.
        </p>
      </LegalSection>

      <LegalSection title="Information kept in your browser">
        <p>
          Lessonique has no product account, database, or custom backend. The
          current classroom keeps the following product data in the browser:
        </p>
        <LegalList>
          <li>
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-foreground">
              lessonique.workspace.v1
            </code>{" "}
            in local storage contains classroom code files, workspace layout,
            and environment configuration. It has no automatic time limit, but
            restoration requires the matching session lesson.
          </li>
          <li>
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-foreground">
              lessonique.lesson.v1
            </code>{" "}
            in session storage contains lesson content, progress, and attempt
            evidence until the browser session ends.
          </li>
          <li>
            In-memory classroom state includes console output, normalized
            learner interactions, and tool activity history. Each retained
            history is bounded to 100 entries and is lost when the page session
            ends.
          </li>
          <li>
            Theme and analytics preference records are described on the
            Storage &amp; Analytics page.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Hosting and audience analytics">
        <p>
          If you accept analytics, Vercel Analytics measures anonymous,
          aggregated visits. The reported visit information can include the
          timestamp, page visited, referrer, approximate geography, device
          type, and browser. Lessonique does not send custom classroom events,
          learner code, lesson content, console output, or interaction payloads
          to Vercel Analytics.
        </p>
        <p>
          Rejecting, dismissing, or later withdrawing analytics permission does
          not block the classroom. Analytics choices expire after 180 days and
          are requested again when the notice version changes. Page-view URLs
          exclude query strings and fragments.
        </p>
        <p>
          Vercel also provides the essential hosting path. Its infrastructure
          may process technical request data such as an IP address, request
          headers, security signals, and timestamps to deliver and protect the
          site. That hosting processing is separate from Lessonique&apos;s optional
          audience analytics choice.
        </p>
      </LegalSection>

      <LegalSection title="WebMCP and connected ChatGPT">
        <p>
          WebMCP lets a connected ChatGPT use Lessonique&apos;s registered classroom
          tools. A normal classroom inspection can return lesson progress and
          console information. File contents, including learner code, are sent
          only when the connected ChatGPT invokes an inspection that explicitly
          requests <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-foreground">file_contents</code>.
          Tool results and the connected conversation are separate from Vercel
          Analytics.
        </p>
        <p>
          ChatGPT and OpenAI process information under their own terms, privacy
          policy, account settings, and service controls. Lessonique does not
          promise that provider data is never used for model improvement; the
          applicable provider settings and policies determine that treatment.
        </p>
      </LegalSection>

      <LegalSection title="Browser code execution with Sandpack">
        <p>
          Lessonique uses a CodeSandbox-hosted Sandpack iframe for browser code
          execution. The classroom sends the current code to that iframe using
          browser <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-foreground">postMessage</code>.
          This draft does not claim that CodeSandbox uploads or retains that
          code on a server; its policy governs any provider-side processing.
        </p>
        <p>
          Learner code runs as untrusted preview content. If that code refers to
          external resources or services, the browser may send requests and
          technical data to those outside recipients under their own policies.
        </p>
      </LegalSection>

      <LegalSection title="Children and supervised learning">
        <p>
          An adult should manage the session when a younger child uses
          Lessonique. ChatGPT requires users to be at least 13, or the minimum
          age required in their country, and users under 18 need permission from
          a parent or legal guardian. Lessonique does not currently verify age
          or parental authorization. This draft makes no claim that a particular
          supervised use satisfies every local legal requirement.
        </p>
      </LegalSection>

      <LegalSection title="Your choices and privacy requests">
        <LegalList>
          <li>
            Open Privacy settings at any time to accept, reject, or withdraw
            optional analytics.
          </li>
          <li>
            Use <strong className="text-foreground">Clear classroom data</strong>{" "}
            in classroom Privacy settings to remove Lessonique&apos;s saved
            workspace and lesson data. This does not delete anonymous aggregate
            records already held by a provider, and those aggregates are not
            designed to identify an individual Lessonique visitor.
          </li>
          <li>
            Privacy rights and requests will be handled through the public
            privacy email once the pending operator contact is supplied. The
            available rights depend on the applicable law and verified request.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Third-party processing and international transfers">
        <p>
          Vercel, CodeSandbox, and OpenAI may process information in countries
          outside your own. Their locations, safeguards, retention practices,
          and rights procedures are described in their policies. Review those
          policies before using the connected services.
        </p>
      </LegalSection>

      <LegalSection title="Provider sources">
        <LegalList>
          <li>
            <ExternalPolicyLink href="https://vercel.com/docs/analytics/privacy-policy">
              Vercel Analytics privacy documentation
            </ExternalPolicyLink>
          </li>
          <li>
            <ExternalPolicyLink href="https://vercel.com/legal/privacy-notice">
              Vercel Privacy Notice
            </ExternalPolicyLink>
          </li>
          <li>
            <ExternalPolicyLink href="https://codesandbox.io/legal/privacy">
              CodeSandbox Privacy Policy
            </ExternalPolicyLink>
          </li>
          <li>
            <ExternalPolicyLink href="https://openai.com/policies/row-terms-of-use/">
              OpenAI Terms of Use
            </ExternalPolicyLink>
          </li>
          <li>
            <ExternalPolicyLink href="https://openai.com/policies/privacy-policy/">
              OpenAI Privacy Policy
            </ExternalPolicyLink>
          </li>
        </LegalList>
      </LegalSection>
    </LegalPage>
  );
}
