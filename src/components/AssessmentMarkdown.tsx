import Markdown from "react-markdown";

/** Render untrusted model prose without HTML, images or executable links. */
export default function AssessmentMarkdown({ text }: { text: string }) {
  const markdown = text
    .trim()
    .replace(/^```(?:markdown|md)\s*\n([\s\S]*?)\n```$/i, "$1");
  return (
    <div className="assessment-prose">
      <Markdown
        skipHtml
        disallowedElements={[
          "img",
          "iframe",
          "script",
          "style",
          "video",
          "audio",
        ]}
        urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : "")}
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h3>{children}</h3>,
          h3: ({ children }) => <h4>{children}</h4>,
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
