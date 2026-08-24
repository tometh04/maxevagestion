import type { Metadata } from "next"
import { PublicQuotationView } from "./public-quotation-view"

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

export default function PublicQuotationPage() {
  return <PublicQuotationView mode="interactive" />
}
