"use client";

import { Children, createContext, isValidElement, memo, useContext, useMemo, type ComponentProps, type ReactNode } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { linkSite, parseChart, prepareAnswer } from "@/lib/assistant/format";
import type { ChatSource } from "@/lib/assistant/types";
import { AnswerChart, ChartNote } from "./AnswerChart";
import { remarkAnswer } from "./remark-answer";

const AnswerContext = createContext<{ sources?: ChatSource[]; streaming: boolean }>({ streaming: false });

/** One tilde stays a tilde, so "~100 to ~200" isn't crossed out. */
const PLUGINS: ComponentProps<typeof Markdown>["remarkPlugins"] = [[remarkGfm, { singleTilde: false }], remarkAnswer];

type LinkProps = ComponentProps<"a"> & ExtraProps & { "data-cite"?: string };

/** A citation links to the page it came from, and an ordinary link leaves the chat open behind it. */
function AnswerLink({ node: _node, href, children, "data-cite": cite, ...props }: LinkProps) {
  const { sources, streaming } = useContext(AnswerContext);
  if (cite) {
    const source = sources?.find((s) => s.n === Number(cite));
    if (source) {
      return (
        <a className="assist-cite" href={source.href} target="_blank" rel="noopener" aria-label={`Source ${cite}: ${source.title}`}>
          {cite}
        </a>
      );
    }
    // Sources come with the last word. After that, whatever's left over is the person's own, like a list in code.
    return streaming ? <span className="assist-cite">{cite}</span> : <>[{cite}]</>;
  }
  if (!href) return <>{children}</>;
  if (href.startsWith("#")) return <a href={href} {...props}>{children}</a>;
  const site = linkSite(href);
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
      {/* Passages can be written by anyone in a unit, so a model could be talked into a link. Its real address always shows. */}
      {site && !Children.toArray(children).join("").includes(site) && <span className="assist-md__site"> ({site})</span>}
    </a>
  );
}

function ChartBlock({ source }: { source: string }) {
  const { streaming } = useContext(AnswerContext);
  const spec = useMemo(() => parseChart(source), [source]);
  if (spec) return <AnswerChart spec={spec} />;
  return <ChartNote pending={streaming} />;
}

function CodeBlock({ node: _node, children, ...props }: ComponentProps<"pre"> & ExtraProps) {
  const code = Children.toArray(children)[0];
  if (isValidElement<{ className?: string; children?: ReactNode }>(code) && code.props.className === "language-chart") {
    return <ChartBlock source={String(code.props.children ?? "")} />;
  }
  return (
    <pre tabIndex={0} {...props}>
      {children}
    </pre>
  );
}

function Table({ node: _node, ...props }: ComponentProps<"table"> & ExtraProps) {
  return (
    <div className="assist-md__table" role="region" aria-label="Table" tabIndex={0}>
      <table {...props} />
    </div>
  );
}

/** A heading sits under the dialog's own h2, however high up the model pitched it. */
const heading = (Tag: "h3" | "h4" | "h5") =>
  function Heading({ node: _node, ...props }: ComponentProps<"h3"> & ExtraProps) {
    return <Tag {...props} />;
  };

/*
 * Fixed for the life of the page: new components on each new word would rebuild every graph in the answer. An image is
 * shown as its description and never loaded, because its address could carry what the model read to someone's server.
 */
const COMPONENTS: Components = {
  a: AnswerLink as Components["a"],
  pre: CodeBlock,
  table: Table,
  h1: heading("h3"),
  h2: heading("h3"),
  h3: heading("h4"),
  h4: heading("h5"),
  h5: heading("h5"),
  h6: heading("h5"),
  img: ({ alt }) => <>{alt}</>,
};

/**
 * An answer as a reader should see it: Markdown with lists, tables and graphs, its citations linked to the pages they
 * came from, and those pages listed under it.
 */
export const Answer = memo(function Answer({ text, sources, streaming = false }: { text: string; sources?: ChatSource[]; streaming?: boolean }) {
  const markdown = useMemo(() => prepareAnswer(text, streaming), [text, streaming]);
  const context = useMemo(() => ({ sources, streaming }), [sources, streaming]);
  return (
    <div className="assist-msg assist-msg--assistant">
      <AnswerContext.Provider value={context}>
        <div className="assist-md">
          <Markdown remarkPlugins={PLUGINS} components={COMPONENTS}>
            {markdown}
          </Markdown>
        </div>
      </AnswerContext.Provider>
      {!!sources?.length && (
        <ol className="assist-sources" aria-label="Sources">
          {sources.map((s) => (
            <li key={s.n}>
              <a href={s.href} target="_blank" rel="noopener">
                <span className="assist-cite" aria-hidden="true">
                  {s.n}
                </span>
                {s.title}
                {s.from && <span className="assist-sources__from">{s.from}, not reviewed by the Office</span>}
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
});
