import type { GroundingMetadata } from "firebase/ai";

/** Grounding supplies retrieved links, not a trust or relevance guarantee. */
export function groundingSources(metadata?: GroundingMetadata) {
  return (
    metadata?.groundingChunks?.flatMap((chunk, index) => {
      if (!chunk.web?.uri) return [];
      let url: URL;
      try {
        url = new URL(chunk.web.uri);
      } catch {
        return [];
      }
      if (!["http:", "https:"].includes(url.protocol)) return [];
      const redirected = url.hostname === "vertexaisearch.cloud.google.com";
      const label = chunk.web.title?.trim() || url.hostname;
      // Search sometimes returns an opaque redirect and only a domain as title.
      // A reported publisher label must never be presented as verified identity.
      const publisher =
        redirected && /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(label)
          ? label.toLowerCase().replace(/^www\./, "")
          : url.hostname.replace(/^www\./, "");
      const community =
        /(?:^|\.)(?:github\.com|github\.io|gitlab\.com|stackoverflow\.com)$/.test(
          publisher,
        );
      const excerpts =
        metadata.groundingSupports
          ?.filter((support) => support.groundingChunkIndices?.includes(index))
          .flatMap((support) =>
            support.segment?.text?.trim() ? [support.segment.text.trim()] : [],
          )
          .slice(0, 2) ?? [];
      return [
        { uri: chunk.web.uri, title: label, community, redirected, excerpts },
      ];
    }) ?? []
  );
}
