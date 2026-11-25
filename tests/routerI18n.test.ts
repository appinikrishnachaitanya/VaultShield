import { it, expect } from "vitest";
import ts from "typescript";
import { readFileSync } from "node:fs";
import hindi from "../src/lib/hi.json";
it("provides Hindi copy for every literal string in the new privacy-router components", () => {
  const files = [
    "RoutingBanner",
    "PrivacyReceipt",
    "LeakTestPanel",
    "NetworkProof",
    "CommunitySignal",
    "DemoStories",
    "CloudApproval",
    "LocalCheckNotice",
    "ReviewDialog",
  ];
  const missing: string[] = [];
  for (const name of files) {
    const source = ts.createSourceFile(
      name + ".tsx",
      readFileSync("src/components/" + name + ".tsx", "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "t"
      ) {
        const inspect = (n: ts.Node) => {
          if (ts.isConditionalExpression(n)) {
            inspect(n.whenTrue);
            inspect(n.whenFalse);
            return;
          }
          if (
            ts.isStringLiteral(n) &&
            n.text.trim() &&
            !Object.hasOwn(hindi, n.text.trim())
          )
            missing.push(n.text);
          ts.forEachChild(n, inspect);
        };
        if (node.arguments[0]) inspect(node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(missing).toEqual([]);
});
