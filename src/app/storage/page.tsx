import type { Metadata } from "next";

import {
  LegalList,
  LegalPage,
  LegalSection,
} from "@/components/privacy/legal-page";

export const metadata: Metadata = {
  title: "Storage & Analytics | Lessonique",
  description:
    "Draft details about Lessonique browser storage, retention, and analytics choices.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

const storageRecords = [
  {
    key: "lessonique.workspace.v1",
    location: "Local storage",
    purpose:
      "Classroom code files, workspace layout, active environment profile, and workspace configuration.",
    retention:
      "No automatic time limit. A saved workspace is restored only when the matching session lesson is also available.",
  },
  {
    key: "lessonique.lesson.v1",
    location: "Session storage",
    purpose:
      "Lesson content, learning progress, and attempt evidence for the current browser session.",
    retention:
      "Until the browser session ends, or until classroom data is cleared.",
  },
  {
    key: "lessonique-theme",
    location: "Local storage",
    purpose: "The selected light, dark, or system appearance preference.",
    retention:
      "Until the browser site data is cleared or the preference is changed.",
  },
  {
    key: "lessonique.privacy.v1",
    location: "Local storage",
    purpose:
      "The analytics preference record: { choice, noticeVersion, decidedAt, expiresAt }.",
    retention:
      "Expires after 180 days. Expired or invalid records are removed when the site next reads them. Missing or unreadable records disable analytics; a notice-version change requests a new choice.",
  },
] as const;

export default function StoragePage() {
  return (
    <LegalPage
      title="Storage & Analytics"
      description="A plain-language inventory of Lessonique browser storage and the optional audience analytics control."
    >
      <LegalSection title="Browser storage inventory">
        <p>
          These are the four named browser records owned by the current
          Lessonique product. Classroom code and progress remain on the device
          unless a connected feature described in the Privacy Notice is used.
        </p>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-3xl border-collapse text-left text-sm">
            <caption className="sr-only">
              Lessonique browser storage keys, purposes, and retention periods
            </caption>
            <thead className="bg-muted/70 text-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Key
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Location
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Purpose
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Retention
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {storageRecords.map((record) => (
                <tr key={record.key} className="align-top">
                  <th
                    scope="row"
                    className="px-4 py-4 font-mono text-xs font-semibold text-foreground"
                  >
                    {record.key}
                  </th>
                  <td className="px-4 py-4">{record.location}</td>
                  <td className="px-4 py-4">{record.purpose}</td>
                  <td className="px-4 py-4">{record.retention}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="Temporary classroom memory">
        <p>
          During an open page session, Lessonique also keeps runtime state in
          memory, including console output, normalized learner interactions,
          and tool activity history. Each retained history is limited to 100
          entries. This runtime memory disappears when the page session ends and
          is not another browser storage key.
        </p>
      </LegalSection>

      <LegalSection title="Analytics choice">
        <LegalList>
          <li>
            Vercel Analytics loads only after an explicit acceptance. Rejection
            and dismissal preserve classroom access with analytics disabled.
          </li>
          <li>
            The choice lasts for 180 days. A new notice version invalidates the
            previous record and asks for a new choice.
          </li>
          <li>
            If Lessonique cannot read or persist a valid preference, analytics
            remains disabled. A storage failure can keep only a temporary choice
            for the current page session.
          </li>
          <li>
            Withdrawing permission blocks later analytics events. Analytics
            page views omit URL queries and fragments, and Lessonique sends no
            custom classroom events or learner payloads.
          </li>
        </LegalList>
        <p>
          Vercel Analytics does not require Lessonique to set third-party
          analytics cookies. This is not a blanket claim that the site,
          infrastructure, connected services, or learner-authored resources can
          never use cookies or comparable browser mechanisms.
        </p>
      </LegalSection>

      <LegalSection title="Provider reporting and retention">
        <p>
          Vercel describes a visitor identifier derived from the incoming request
          rather than a third-party analytics cookie. Its temporary visitor
          session is discarded after 24 hours. This is separate from the analytics
          data available in reports.
        </p>
        <p>
          The current Hobby plan has a one-month reporting window. Vercel may
          retain analytics data longer to support plan upgrades; the reporting
          window is not a guaranteed deletion deadline. See Vercel&apos;s{" "}
          <a className="underline" href="https://vercel.com/docs/analytics/privacy-policy">analytics privacy documentation</a>{" "}
          and{" "}
          <a className="underline" href="https://vercel.com/docs/analytics/limits-and-pricing">reporting-window documentation</a>.
        </p>
      </LegalSection>

      <LegalSection title="Clearing local data">
        <p>
          Privacy settings in the classroom provide a Clear classroom data
          action. It clears Lessonique&apos;s workspace and lesson records and resets
          the active classroom. The theme and privacy-choice records remain so
          that appearance and analytics choices are respected. Clearing local
          classroom data does not erase anonymous aggregate information already
          processed by a provider.
        </p>
      </LegalSection>

      <LegalSection title="Related provider activity">
        <p>
          Essential Vercel hosting can process technical request data separately
          from optional analytics. A connected ChatGPT can receive classroom
          inspection results, and the Sandpack iframe receives current code by
          browser message for execution. Those flows, external learner-code
          requests, provider policies, supervised-minor guidance, and privacy
          request information are explained in the Privacy Notice.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
