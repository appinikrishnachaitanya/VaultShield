import { expect, it } from "vitest";
import { groundingSources } from "../src/lib/groundingSources";
it("keeps actual citation associations without inventing relevance", () => {
  const sources = groundingSources({
    groundingChunks: [
      {
        web: {
          uri: "https://github.com/example/repo",
          title: "Government notice",
        },
      },
      { web: { uri: "https://pib.gov.in/notice", title: "Notice" } },
    ],
    groundingSupports: [
      { groundingChunkIndices: [1], segment: { text: "A supported claim." } },
    ],
  });
  expect(sources[0].community).toBe(true);
  expect(sources[0].excerpts).toEqual([]);
  expect(sources[1].excerpts).toEqual(["A supported claim."]);
});
it("does not trust publisher names inside a deceptive title or domain", () => {
  expect(
    groundingSources({
      groundingChunks: [
        {
          web: {
            uri: "https://github.com.evil.invalid/page",
            title: "pib.gov.in",
          },
        },
      ],
    })[0].community,
  ).toBe(false);
  expect(
    groundingSources({
      groundingChunks: [
        { web: { uri: "javascript:alert(1)", title: "Official" } },
      ],
    }),
  ).toEqual([]);
});
