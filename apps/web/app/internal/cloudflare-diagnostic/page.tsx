import type { Metadata } from "next";
import CloudflareCredentialCheck from "../_components/cloudflare-credential-check";

export const metadata: Metadata = {
  title: "EVE Credential Check",
  description: "Private owner-only Cloudflare credential diagnostic.",
  robots: { index: false, follow: false },
};

export default function CloudflareDiagnosticPage() {
  return <CloudflareCredentialCheck />;
}
