import { describe, expect, it } from "vitest";
import { hasAssessableText, maskIdentifiers } from "../src/lib/privacy";

describe("Indian identifier masking", () => {
  it.each([
    "9876543210",
    "98765 43210",
    "+91-98765-43210",
    "919876543210",
    "+91 98765 43210",
    "98765   43210",
    "98765\u200B43210",
    "123456789012",
    "1234 5678 9012",
    "1234-5678-9012",
    "1234  5678  9012",
    "ABCDE1234F",
    "abcde1234f",
    "person@okhdfcbank",
    "person@paytm",
    "9876543210@upi",
    "person@example.com",
    "person @ okhdfcbank",
    "OTP: 123456",
    "OTP is 1 2 3 4 5 6",
    "https://example.com/private",
    "www.example.com/private",
    "SBIN0001234",
    "Account no: 12345678",
    "UTR: HDFC1234567890",
    "Transaction ID: TXN34567890",
  ])("masks %s without retaining its value", (input) => {
    const output = maskIdentifiers(input).text;
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain(input);
    expect(maskIdentifiers(output).text).toBe(output);
  });
  it("normalizes Devanagari digits before masking", () => {
    expect(
      maskIdentifiers(
        "Call \u096f\u096e\u096d\u096c\u096b\u096a\u0969\u0968\u0967\u0966",
      ).text,
    ).toBe("Call [REDACTED]");
  });
  it("retains deadline and ordinary delivery wording", () => {
    const input =
      "Your parcel arrives today. Pay within 10 minutes. Do not tell your family.";
    expect(maskIdentifiers(input).text).toBe(input);
  });
});

describe("usable reviewed content", () => {
  it.each([
    "",
    "  ",
    "[REDACTED]",
    "[REDACTED] — [REDACTED]",
    "Phone: [REDACTED]\nPAN: [REDACTED]",
    "Phone: [REDACTED] | PAN: [REDACTED]",
    "9876543210",
    "[MASKED]",
    "!!! ₹",
  ])("rejects empty or identifier-only content %s", (text) => {
    expect(hasAssessableText(text)).toBe(false);
  });
  it.each([
    "Pay within 10 minutes to [REDACTED]",
    "Your parcel arrives today.",
    "अभी पैसे भेजो",
    "பணம் அனுப்புங்கள்",
    "Call [REDACTED] to verify.",
  ])("retains actual message wording %s", (text) => {
    expect(hasAssessableText(text)).toBe(true);
  });
});
