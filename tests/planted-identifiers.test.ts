import { it, expect } from "vitest";
import fixtures from "./fixtures/planted-identifiers.json";
import { TokenVaultSession } from "../src/lib/tokenVault";
import { normalizePrivateText } from "../src/lib/privacy";
it("measures raw-value survival across 50 planted synthetic identifiers", () => {
  const canonical = (text: string) =>
    normalizePrivateText(text).toLowerCase().replace(/\s/g, "");
  let leaked = 0;
  const categories: Record<string, { planted: number; remaining: number }> = {};
  for (const fixture of fixtures) {
    const s = new TokenVaultSession();
    const output = s.tokenize(fixture.text);
    const remaining = canonical(output.text).includes(canonical(fixture.value));
    leaked += Number(remaining);
    categories[fixture.category] ??= { planted: 0, remaining: 0 };
    categories[fixture.category].planted++;
    categories[fixture.category].remaining += Number(remaining);
    s.clear();
  }
  const metrics = {
    planted: fixtures.length,
    remaining: leaked,
    masked: fixtures.length - leaked,
    rawValueSurvivalRate: leaked / fixtures.length,
    categories,
  };
  console.info(
    "Synthetic planted-identifier evaluation:",
    JSON.stringify(metrics),
  );
  expect(fixtures).toHaveLength(50);
  expect(categories.PHONE.remaining).toBe(0);
  expect(categories.AADHAAR.remaining).toBe(0);
  expect(categories.PERSON.remaining).toBe(2);
});
