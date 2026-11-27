export type DocumentCategory =
  | "medical"
  | "legal"
  | "land"
  | "loan"
  | "insurance"
  | "bank_statement"
  | "general";

export type DocumentSafetyLevel = "safe" | "review" | "concern";

export type DocumentAnalysisResult = {
  summary: string;
  detectedCategory: DocumentCategory;
  safetyLevel: DocumentSafetyLevel;
  redFlags: string[];
  missingItems: string[];
  keyFacts: string[];
  nextSteps: string[];
  masked: number;
  payloadBytes: number;
  durationMs: number;
  model?: string;
  source?: "ON_DEVICE" | "IN_CLOUD";
};

export const DOCUMENT_CATEGORIES: {
  value: DocumentCategory;
  label: string;
  hint: string;
}[] = [
  { value: "medical", label: "Medical report", hint: "Lab report, prescription, discharge summary" },
  { value: "legal", label: "Legal / court notice", hint: "Summons, IT notice, arrest warrant" },
  { value: "land", label: "Land / property", hint: "Sale deed, Khata, Patta, 7/12 extract" },
  { value: "loan", label: "Loan / finance", hint: "Loan agreement, recovery notice" },
  { value: "insurance", label: "Insurance", hint: "Policy document, claim form" },
  { value: "bank_statement", label: "Bank statement", hint: "Account statement, passbook, transaction history" },
  { value: "general", label: "Any document", hint: "Contract, invoice, certificate" },
];

const categoryInstructions: Record<DocumentCategory, string> = {
  bank_statement: `You are reviewing a bank account statement or passbook.
Identify the account period, opening and closing balances (shown as tokens), and overall transaction patterns.
Flag suspicious patterns: unusually large debits, frequent round-number transactions, transactions to unknown parties, sudden spikes in activity.
Check for: unauthorized debits, duplicate charges, charges from unfamiliar merchants, international transactions the account holder may not recognize.
Identify recurring charges: EMIs, subscriptions, standing instructions — flag any that seem unexpected.
Never reconstruct actual account numbers or amounts — work with the tokens provided.`,
  medical: `You are reviewing a medical document (lab report, prescription, discharge summary, or similar).
Explain findings in plain language a non-doctor can understand.
Flag any values outside reference ranges or unusual findings.
Check if key items are present: doctor name (shown as token), date, lab accreditation number.
Never diagnose — only describe what the document says and what may need follow-up.`,

  legal: `You are reviewing a legal or government notice (court summons, IT notice, arrest warrant, or similar).
Check if the format matches genuine official documents: proper case/notice number format, official letterhead indicators, appropriate legal language.
Flag inconsistencies that suggest it may be fake: missing court seal references, unofficial payment instructions, grammar inconsistent with government documents.
Explain what the notice is asking for in plain language.
Identify any unreasonable or suspicious demands.`,

  land: `You are reviewing a land or property document (sale deed, Khata, Patta, 7/12 extract, or similar).
Check for critical missing elements: encumbrance certificate reference, witness count, registration date, survey number, property schedule.
Flag concerning clauses: one-sided termination rights, missing boundary descriptions, unexplained encumbrances, power of attorney abuse.
Explain key Indian property terms (Khata, mutation, encumbrance, patta) simply.`,

  loan: `You are reviewing a loan agreement, recovery notice, or financial document.
Identify the actual interest rate and whether it matches what was advertised.
Flag predatory clauses: unlimited penalty clauses, one-sided termination, confession of judgment, waiver of legal rights, non-standard repossession terms.
Check if key terms are defined: processing fee, prepayment penalty, default consequences.
If a recovery notice: check if it matches legitimate bank/NBFC formats.`,

  insurance: `You are reviewing an insurance policy or claim document.
Explain what is and is not covered in plain language.
Flag unusual exclusions or conditions that limit coverage.
Identify key dates: premium due, waiting periods, claim filing deadlines, policy term.
Explain what steps are needed to file a claim.`,

  general: `You are reviewing a formal document that may be a contract, invoice, certificate, or agreement.
Summarize what it is and what it requires the reader to do or agree to.
Flag any concerning requirements, unusually broad rights transfers, hidden penalties, or suspicious patterns.
Identify key dates, amounts (shown as tokens), and parties involved (shown as tokens).`,
};

export function buildDocumentExtractionPrompt(category: DocumentCategory): string {
  return `You are an OCR and text extraction assistant. Extract ALL visible text from this document image.
Do NOT analyze, interpret, summarize, or redact anything. Do NOT add commentary or explanations.
Preserve structure: use line breaks where the document has them. Preserve table structure with | separators.
If handwritten text is present, transcribe it in [square brackets].
Document type hint: ${category}.
Return only the raw extracted text, nothing else.`;
}

export function buildDocumentAnalysisPrompt(
  tokenizedText: string,
  category: DocumentCategory,
  language?: "en" | "hi",
): string {
  const langInstruction = language === "hi"
    ? "\n\nIMPORTANT: Respond in Hindi (Devanagari script). JSON keys remain in English, but all string values (summary, redFlags, missingItems, keyFacts, nextSteps) must be in Hindi."
    : "";
  return `${categoryInstructions[category]}

IMPORTANT PRIVACY CONTEXT: All personal identifiers in this text have been replaced with privacy tokens like [PERSON_1], [AADHAAR_1], [AMOUNT_1:50k-plus], [PHONE_1]. This is intentional — the actual values are protected on the user's device and are NOT available to you. Refer to people and entities by their tokens (e.g. "the borrower [PERSON_1]"). Never attempt to infer or reconstruct the original values.

DOCUMENT TEXT (privacy-tokenized):
${tokenizedText}

Respond with valid JSON only — no markdown, no preamble, just the JSON object:
{
  "summary": "2-3 sentence plain-language summary of what this document is and what it asks",
  "detectedCategory": "medical | legal | land | loan | insurance | general",
  "safetyLevel": "safe | review | concern",
  "redFlags": ["specific concerning item found verbatim or paraphrased from the document", "another if present"],
  "missingItems": ["item that should be present but is absent", "another if present"],
  "keyFacts": ["important fact 1", "important fact 2", "important fact 3"],
  "nextSteps": ["concrete action to take", "another if needed"]
}
safetyLevel: safe = routine document, no concerns. review = needs careful reading or professional advice. concern = potentially fraudulent, predatory, or contains seriously harmful clauses.
Use empty arrays [] when there are no red flags or missing items. Keep each string under 120 characters.${langInstruction}`;
}
