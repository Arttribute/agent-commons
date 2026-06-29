import type { Metadata } from "next";
import { LegalPage } from "../legal-page";
import { privacyPolicy } from "../legal-content";

export const metadata: Metadata = {
  title: "Privacy Policy | Agent Commons",
  description: privacyPolicy.description,
};

export default function PrivacyPage() {
  return <LegalPage document={privacyPolicy} current="privacy" />;
}
