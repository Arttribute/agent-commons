import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Nav } from "@/components/nav";

export const metadata = {
  title: "Terms & Conditions — Agent Commons Courses",
  description:
    "Terms and conditions for enrolling in and accessing Agent Commons Courses.",
};

const EFFECTIVE_DATE = "1 April 2026";
const COMPANY = "Agent Commons";
const PLATFORM = "Agent Commons Courses";
const CONTACT_EMAIL = "courses@agentcommons.io";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />

      <main className="max-w-3xl mx-auto px-6 lg:px-8 pt-28 pb-24">
        {/* Header */}
        <div className="mb-12">
          <p className="text-xs tracking-[0.2em] uppercase text-slate-400 mb-3">
            Legal
          </p>
          <h1 className="text-4xl font-bold text-slate-900 mb-3">
            Terms &amp; Conditions
          </h1>
          <p className="text-sm text-slate-400">
            Effective date: {EFFECTIVE_DATE}
          </p>
        </div>

        {/* Intro */}
        <div className="prose prose-slate max-w-none text-sm leading-relaxed space-y-8">
          <p className="text-slate-600 text-base leading-relaxed">
            Please read these Terms &amp; Conditions carefully before enrolling
            in or accessing any course on {PLATFORM}. By clicking &ldquo;Accept
            &amp; Enrol&rdquo; or by accessing any course content, you confirm
            that you have read, understood, and agree to be bound by these
            terms. If you do not agree, do not access or use the platform.
          </p>

          <Section title="1. Who We Are">
            <p>
              {PLATFORM} is operated by {COMPANY} (&ldquo;we&rdquo;,
              &ldquo;us&rdquo;, &ldquo;our&rdquo;). We provide structured
              online courses on artificial intelligence, autonomous agents, and
              related technical subjects. Our contact email is{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-slate-900 underline underline-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section title="2. Eligibility">
            <p>
              You must be at least 16 years of age to create an account and
              access courses. By creating an account you represent that all
              information you provide is accurate and that you have the legal
              capacity to enter into these terms.
            </p>
          </Section>

          <Section title="3. Account Registration">
            <ul>
              <li>
                You are responsible for maintaining the confidentiality of your
                login credentials.
              </li>
              <li>
                You may not share your account with others or permit third
                parties to access course content through your account.
              </li>
              <li>
                You must notify us immediately at {CONTACT_EMAIL} if you
                suspect any unauthorised access to your account.
              </li>
              <li>
                We reserve the right to suspend or terminate accounts that
                violate these terms.
              </li>
            </ul>
          </Section>

          <Section title="4. Course Access and Licence">
            <p>
              Upon successful enrolment (and payment where applicable), we
              grant you a personal, non-exclusive, non-transferable,
              revocable licence to access and view the course content for your
              own personal, non-commercial educational purposes.
            </p>
            <ul>
              <li>
                Course access is granted to you as an individual and may not
                be shared, sublicensed, resold, or transferred.
              </li>
              <li>
                You may not download, copy, reproduce, distribute, publicly
                display, or create derivative works from any course material
                without our prior written consent.
              </li>
              <li>
                Free preview lessons are provided without enrolment and may be
                withdrawn at any time.
              </li>
              <li>
                For paid courses, lifetime access means access for as long as
                the platform operates and the course remains available. We
                reserve the right to retire courses with reasonable notice.
              </li>
            </ul>
          </Section>

          <Section title="5. Payments and Refunds">
            <p>
              All prices are listed in USD and are exclusive of any applicable
              taxes unless stated otherwise.
            </p>
            <ul>
              <li>
                Payment is processed securely via Stripe. We do not store your
                card details.
              </li>
              <li>
                <strong>Refund policy:</strong> You may request a full refund
                within 14 days of purchase, provided you have not completed
                more than 20% of the course content. Refund requests must be
                submitted to {CONTACT_EMAIL}.
              </li>
              <li>
                Refunds will be issued to the original payment method within
                5&ndash;10 business days.
              </li>
              <li>
                We reserve the right to refuse a refund if there is evidence of
                abuse of the refund policy.
              </li>
            </ul>
          </Section>

          <Section title="6. Live Classes">
            <p>
              Some courses are delivered as live scheduled sessions. The
              following additional terms apply:
            </p>
            <ul>
              <li>
                Sessions are held at the times published on the course page.
                Times may be changed with at least 48 hours&rsquo; notice.
              </li>
              <li>
                Live sessions may be recorded. By attending you consent to
                being recorded; recordings are made available to enrolled
                students only.
              </li>
              <li>
                Enrolment capacity may be limited. Enrolment is confirmed on a
                first-come, first-served basis upon payment.
              </li>
              <li>
                If a session is cancelled by us, enrolled students will receive
                a full refund or the option to transfer to a rescheduled
                session.
              </li>
            </ul>
          </Section>

          <Section title="7. Intellectual Property">
            <p>
              All course content — including videos, slides, code samples,
              written material, and any associated resources — is the
              intellectual property of {COMPANY} or its licensors and is
              protected by copyright law.
            </p>
            <p>
              Code samples provided as part of course exercises are licensed
              under the MIT licence unless otherwise stated. All other content
              remains proprietary.
            </p>
          </Section>

          <Section title="8. Acceptable Use">
            <p>
              You agree not to use the platform or any course content to:
            </p>
            <ul>
              <li>
                Violate any applicable law, regulation, or third-party rights.
              </li>
              <li>
                Reproduce or redistribute course materials beyond the personal
                licence granted herein.
              </li>
              <li>
                Misrepresent completion or certification of courses to third
                parties.
              </li>
              <li>
                Circumvent or attempt to circumvent any technical measures that
                restrict access to course content.
              </li>
              <li>
                Post, transmit, or share any content that is unlawful, harmful,
                offensive, or infringes third-party rights.
              </li>
            </ul>
          </Section>

          <Section title="9. Certificates of Completion">
            <p>
              Where a certificate of completion is issued, it is a record of
              your completion of the course content on this platform. It does
              not constitute a professional qualification, academic credential,
              or certification recognised by any regulatory or professional
              body unless explicitly stated.
            </p>
          </Section>

          <Section title="10. Disclaimer of Warranties">
            <p>
              Course content is provided for educational purposes only. While
              we make every effort to ensure accuracy, we make no warranties
              that the content is complete, current, error-free, or fit for any
              particular purpose. Nothing in any course constitutes professional
              legal, financial, or technical advice.
            </p>
            <p>
              The platform is provided &ldquo;as is&rdquo; and &ldquo;as
              available&rdquo;. We do not guarantee uninterrupted or error-free
              access.
            </p>
          </Section>

          <Section title="11. Limitation of Liability">
            <p>
              To the fullest extent permitted by law, {COMPANY} shall not be
              liable for any indirect, incidental, special, consequential, or
              punitive damages arising from your use of, or inability to use,
              the platform or course content. Our total liability to you for
              any claim shall not exceed the amount you paid for the relevant
              course.
            </p>
          </Section>

          <Section title="12. Privacy">
            <p>
              We collect and process personal data in accordance with our
              Privacy Policy. By creating an account and enrolling in courses
              you consent to such processing. We do not sell your personal data
              to third parties.
            </p>
          </Section>

          <Section title="13. Changes to These Terms">
            <p>
              We reserve the right to update these terms at any time. We will
              notify registered users of material changes by email or via a
              notice on the platform. Continued access to the platform after
              such notice constitutes acceptance of the revised terms.
            </p>
          </Section>

          <Section title="14. Governing Law">
            <p>
              These terms are governed by and construed in accordance with the
              laws of England and Wales. Any disputes shall be subject to the
              exclusive jurisdiction of the courts of England and Wales, unless
              mandatory consumer protection laws in your country of residence
              provide otherwise.
            </p>
          </Section>

          <Section title="15. Contact">
            <p>
              If you have any questions about these terms, please contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-slate-900 underline underline-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white px-6 lg:px-12 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 border-t border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded bg-slate-900 flex items-center justify-center">
            <BookOpen className="h-3 w-3 text-white" />
          </div>
          <span>© 2026 Agent Commons</span>
        </div>
        <div className="flex gap-6">
          <Link href="/courses" className="hover:text-slate-700 transition-colors">
            Courses
          </Link>
          <Link href="/terms" className="text-slate-700">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-base font-bold text-slate-900 mb-3">{title}</h2>
      <div className="space-y-3 text-slate-600 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2">
        {children}
      </div>
    </div>
  );
}
