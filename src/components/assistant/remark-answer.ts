/*
 * The chat's own reading of Markdown: a line break the model typed stays a line break, [1] becomes a citation, and a
 * wall of sentences becomes short paragraphs, whichever model wrote it and however well it followed its instructions.
 */
import type { Nodes, Paragraph, Parents, PhrasingContent, Root, RootContent } from "mdast";
import { CITATION_MARK } from "@/lib/assistant/format";

/** The most sentences in a row before a new paragraph starts. */
const SENTENCES = 3;
const SENTENCE_END = /[.!?][)"”’']*(?:\s*\[\d+(?:\s*,\s*\d+)*\])*\s+(?=["“‘(]?[A-Z0-9À-Þ])/g;
/** Full stops that don't end a sentence: "Dr. Cruz", "J. Cruz", "e.g. this", "Nov. 20". */
const ABBREVIATION = /(?:^|[\s(])(?:[A-Z]|[a-zA-Z]\.[a-zA-Z]|etc|vs|cf|al|approx|Dr|Mr|Mrs|Ms|Prof|Engr|Atty|Rev|Fr|Sr|Jr|St|Sto|No|Nos|Inc|Ltd|Co|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.$/;

function paced(paragraph: Paragraph): Paragraph[] {
  const done: Paragraph[] = [];
  let current: PhrasingContent[] = [];
  let count = 0;
  for (const node of paragraph.children) {
    if (node.type !== "text") {
      current.push(node);
      continue;
    }
    let from = 0;
    for (const match of node.value.matchAll(SENTENCE_END)) {
      if (ABBREVIATION.test(node.value.slice(Math.max(0, match.index - 12), match.index + 1))) continue;
      if (++count < SENTENCES) continue;
      current.push({ type: "text", value: node.value.slice(from, match.index + match[0].trimEnd().length) });
      done.push({ type: "paragraph", children: current });
      current = [];
      count = 0;
      from = match.index + match[0].length;
    }
    if (from < node.value.length) current.push({ type: "text", value: node.value.slice(from) });
  }
  if (current.length) done.push({ type: "paragraph", children: current });
  return done;
}

function inline(value: string, cites: boolean): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  value.split("\n").forEach((line, i) => {
    if (i) out.push({ type: "break" });
    if (!cites) {
      if (line) out.push({ type: "text", value: line });
      return;
    }
    line.split(new RegExp(CITATION_MARK, "g")).forEach((part, k) => {
      if (k % 2) out.push({ type: "link", url: "#", children: [{ type: "text", value: part }], data: { hProperties: { "data-cite": part } } });
      else if (part) out.push({ type: "text", value: part });
    });
  });
  return out;
}

function walk(parent: Parents, cites: boolean) {
  (parent as { children: Nodes[] }).children = parent.children.flatMap((node): Nodes[] => {
    if (node.type === "text") return inline(node.value, cites);
    // The one bit of HTML models lean on, usually for a second line in a table cell. All other HTML shows as text.
    if (node.type === "html" && /^<br\s*\/?>$/i.test(node.value.trim())) return [{ type: "break" }];
    // A link can't hold another link.
    if ("children" in node) walk(node, cites && node.type !== "link" && node.type !== "linkReference");
    return [node];
  });
}

export function remarkAnswer() {
  return (tree: Root) => {
    tree.children = tree.children.flatMap((node): RootContent[] => (node.type === "paragraph" ? paced(node) : [node]));
    walk(tree, true);
  };
}
