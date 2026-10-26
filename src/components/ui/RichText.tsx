/*
 * A story written in the post editor, drawn as React elements from the parsed rich-text tree (lib/rich-text.ts),
 * never as raw HTML. Works on the server and in the browser.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { TEXT_SIZES, parseRich, type Block, type Inline, type List } from "@/lib/rich-text";

type Props = {
  html: string;
  /** Extra attributes for each top-level paragraph or list, by its position. */
  block?: (index: number) => HTMLAttributes<HTMLElement>;
  linkClassName?: string;
};

export function RichText({ html, block, linkClassName }: Props) {
  return <>{parseRich(html).map((b, i) => drawBlock(b, i, block?.(i) ?? {}, linkClassName))}</>;
}

function drawBlock(b: Block, key: number, attrs: HTMLAttributes<HTMLElement>, link?: string): ReactNode {
  if (b.kind === "p")
    return (
      <p key={key} {...attrs}>
        {b.kids.length ? drawInline(b.kids, link) : <br />}
      </p>
    );
  return drawList(b, key, attrs, link);
}

function drawList(l: List, key: number, attrs: HTMLAttributes<HTMLElement>, link?: string): ReactNode {
  const Tag = l.kind;
  return (
    <Tag key={key} {...attrs}>
      {l.items.map((item, i) => (
        <li key={i}>{item.map((part, j) => (Array.isArray(part) ? <span key={j}>{drawInline(part, link)}</span> : drawList(part, j, {}, link)))}</li>
      ))}
    </Tag>
  );
}

function drawInline(nodes: Inline[], link?: string): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.kind) {
      case "text":
        return n.text;
      case "br":
        return <br key={i} />;
      case "a":
        return (
          <a key={i} href={n.href} className={link} {...(n.href.startsWith("mailto:") ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
            {drawInline(n.kids, link)}
          </a>
        );
      case "span": {
        const style: CSSProperties = { color: n.style.color, backgroundColor: n.style.bg, fontSize: n.style.size && TEXT_SIZES[n.style.size] };
        return (
          <span key={i} className={n.style.bg ? "rt-hl" : undefined} style={style}>
            {drawInline(n.kids, link)}
          </span>
        );
      }
      default: {
        const Tag = n.kind;
        return <Tag key={i}>{drawInline(n.kids, link)}</Tag>;
      }
    }
  });
}
