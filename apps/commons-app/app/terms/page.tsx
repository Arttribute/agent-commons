import type { Metadata } from "next";
import { LegalPage } from "../legal-page";
import { termsOfService } from "../legal-content";

export const metadata: Metadata = {
  title: "Terms of Service | Agent Commons",
  description: termsOfService.description,
};

export default function TermsPage() {
  return <LegalPage document={termsOfService} current="terms" />;
}
