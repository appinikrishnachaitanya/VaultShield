import { describe, it, expect } from "vitest";
import { TokenVaultSession, rehydrate } from "../src/lib/tokenVault";
import { detectIdentifiers, maskIdentifiers } from "../src/lib/privacy";
import { buildPrivateScanPrompt } from "../src/lib/ai/privateScanPrompt";
describe("public authority and name span regressions", () => {
  it("keeps the agency while masking the named officer", () => {
    const s = new TokenVaultSession();
    const raw = "Mr. Verma from Mumbai Police says pay now.";
    const value = s.tokenize(raw);
    expect(value.text).toBe("Mr. [PERSON_1] from Mumbai Police says pay now.");
    expect(rehydrate(value.text, s)).toBe(raw);
    expect(buildPrivateScanPrompt(value.text)).toContain("Mumbai Police");
    s.clear();
  });
  it.each([
    "Mumbai Police",
    "Delhi Police",
    "Central Bureau of Investigation",
    "Enforcement Directorate",
    "RBI",
    "TRAI",
    "NPCI",
    "Supreme Court",
    "Delhi High Court",
    "State Bank of India",
    "State Bank",
    "HDFC Bank",
    "Punjab National Bank",
  ])("preserves public-body evidence after from: %s", (agency) => {
    const result = maskIdentifiers(
      "A notice from " + agency + " says pay now.",
    );
    expect(result.text).toContain(agency);
    expect(
      detectIdentifiers("A notice from " + agency + ".").matches.filter(
        (x) => x.category === "PERSON",
      ),
    ).toHaveLength(0);
  });
  it.each([
    "Inspector Rahul Sharma",
    "Officer Rahul Sharma",
    "Mr. Rahul Sharma",
    "Hi Rahul Sharma",
    "My name is Rahul Sharma",
  ])("keeps one contiguous identity for %s", (raw) => {
    const s = new TokenVaultSession();
    const value = s.tokenize(raw);
    expect(value.entries).toHaveLength(1);
    expect(value.entries[0].original).toBe("Rahul Sharma");
    expect(value.text).not.toMatch(/\]\s*\[PERSON/);
    expect(rehydrate(value.text, s)).toBe(raw);
    s.clear();
  });
  it("masks a document recipient while retaining institutional names", () => {
    const s = new TokenVaultSession();
    const value = s.tokenize(
      "Your bank statement for Anita Desai is attached. Contact State Bank of India.",
    );
    expect(value.text).not.toContain("Anita Desai");
    expect(value.text).toContain("State Bank of India");
    s.clear();
  });
  it("does not let a protected agency swallow an adjacent private name", () => {
    const s = new TokenVaultSession();
    const value = s.tokenize("Officer Rahul Sharma Mumbai Police");
    expect(value.text).not.toContain("Rahul Sharma");
    expect(value.text).toContain("Mumbai Police");
    s.clear();
  });
  it("does not merge separate names across words or line breaks", () => {
    const s = new TokenVaultSession();
    const value = s.tokenize("Hi Ravi Kumar\nHello Priya Nair");
    expect(value.entries).toHaveLength(2);
    expect(value.text).toContain("\n");
    s.clear();
  });
});
