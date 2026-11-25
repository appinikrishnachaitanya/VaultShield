import type { IdentifierCategory } from "./privacy";
const labels: Record<IdentifierCategory, string> = {
  PERSON: "Names",
  PHONE: "Phone numbers",
  BANK_ACC: "Bank accounts",
  UPI: "UPI IDs",
  AADHAAR: "Aadhaar numbers",
  PAN: "PAN numbers",
  EMAIL: "Email addresses",
  URL: "Links",
  AMOUNT: "Amounts",
  OTP: "One-time codes",
  ORG: "Organisations",
  REFERENCE: "Payment references",
  IFSC: "Bank routing codes",
  PRIVATE: "Other masked details",
};
export function privacyCategoryLabel(category: string): string {
  return Object.hasOwn(labels, category)
    ? labels[category as IdentifierCategory]
    : category;
}
