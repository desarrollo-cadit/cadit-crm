import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * cursos-offline — A tiny, SAFE markdown renderer for the imported library.
 *
 * The content is short plain text from LearnDash: paragraphs, a few lists,
 * bold, the odd link. A markdown dependency would be more than the content
 * needs, and `dangerouslySetInnerHTML` would turn any `<script>` that slipped
 * through the export into code. So this builds React ELEMENTS: everything is
 * text unless this file decided to make it an element, and React escapes the
 * text. Links are made only for http(s) URLs.
 *
 * Supported: paragraphs (blank line), line breaks, `#`..`###` headings,
 * `-`/`*`/`+` and `1.` lists, **bold**, *italic*, `code`, [text](url) and
 * plain URLs. Anything else stays as literal text.
 *
 * Shared by the staff library (T4) and the student portal (T5).
 */

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "ul" | "ol"; items: string[] };

const HEADING = /^(#{1,3})\s+(.*)$/;
const UL_ITEM = /^\s*[-*+]\s+(.*)$/;
const OL_ITEM = /^\s*\d+[.)]\s+(.*)$/;

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;

  const close = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const rawLine of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      close();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      close();
      const level = heading[1]!.length as 1 | 2 | 3;
      blocks.push({ kind: "h", level, text: heading[2]!.trim() });
      continue;
    }

    const ul = UL_ITEM.exec(line);
    const ol = ul ? null : OL_ITEM.exec(line);
    const listKind = ul ? "ul" : ol ? "ol" : null;
    if (listKind) {
      const text = (ul ?? ol)![1]!;
      const open = current as Block | null;
      if (open && open.kind === listKind) {
        open.items.push(text);
      } else {
        close();
        current = { kind: listKind, items: [text] };
      }
      continue;
    }

    const open = current as Block | null;
    if (open && open.kind === "p") {
      open.lines.push(line.trim());
    } else {
      close();
      current = { kind: "p", lines: [line.trim()] };
    }
  }
  close();
  return blocks;
}

/**
 * Only absolute http(s) URLs become links. `javascript:`, `data:`, relative
 * paths and anything the URL parser rejects stay as text.
 */
export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * One regex, alternatives in priority order. `exec` returns the LEFTMOST
 * match, and at one position tries the alternatives left to right — so code
 * wins over bold, and a markdown link wins over the bare URL inside it.
 *
 * The link target allows one level of balanced parentheses so that
 * `[x](javascript:alert(1))` is consumed WHOLE and then refused, instead of
 * leaving a stray `)` behind.
 */
const INLINE =
  /(`[^`\n]+`)|\[([^\]\n]+)\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)\)|\*\*([^*\n]+?)\*\*|\*([^*\s][^*\n]*?)\*|(https?:\/\/[^\s<>]+)/;

const LINK_CLASS = "text-brand-text underline underline-offset-2 hover:text-foreground";

/** A bare URL does not own its trailing punctuation: "ver https://x.com." */
function trimUrl(url: string): { url: string; rest: string } {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1]!;
    if (".,;:!?'\"".includes(ch)) {
      end -= 1;
      continue;
    }
    if (ch === ")") {
      const body = url.slice(0, end);
      const opens = body.split("(").length - 1;
      const closes = body.split(")").length - 1;
      if (closes > opens) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return { url: url.slice(0, end), rest: url.slice(end) };
}

function renderInline(text: string, allowLinks = true, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;

  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const key = `${keyPrefix}-${n++}`;
    const [whole, code, linkText, linkUrl, bold, italic, bareUrl] = m;

    if (code !== undefined) {
      out.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {code.slice(1, -1)}
        </code>
      );
    } else if (linkText !== undefined) {
      const href = allowLinks ? safeHref(linkUrl ?? "") : null;
      const label = renderInline(linkText, false, key);
      out.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            {label}
          </a>
        ) : (
          <Fragment key={key}>{label}</Fragment>
        )
      );
    } else if (bold !== undefined) {
      out.push(<strong key={key}>{renderInline(bold, allowLinks, key)}</strong>);
    } else if (italic !== undefined) {
      out.push(<em key={key}>{renderInline(italic, allowLinks, key)}</em>);
    } else if (bareUrl !== undefined) {
      const { url, rest: tail } = trimUrl(bareUrl);
      const href = allowLinks ? safeHref(url) : null;
      out.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            {url}
          </a>
        ) : (
          url
        )
      );
      if (tail) out.push(tail);
    }
    rest = rest.slice(m.index + whole.length);
  }
  return out;
}

const HEADING_CLASS = {
  1: "text-base font-semibold",
  2: "text-sm font-semibold",
  3: "text-sm font-medium",
} as const;

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseBlocks(source);
  if (blocks.length === 0) return null;

  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      {blocks.map((block, i) => {
        const key = `b${i}`;
        switch (block.kind) {
          case "h": {
            // h3..h5: the page around the content already owns h1/h2.
            const Tag = (["h3", "h4", "h5"] as const)[block.level - 1]!;
            return (
              <Tag key={key} className={HEADING_CLASS[block.level]}>
                {renderInline(block.text, true, key)}
              </Tag>
            );
          }
          case "ul":
          case "ol": {
            const Tag = block.kind;
            return (
              <Tag
                key={key}
                className={cn("space-y-1 pl-5", block.kind === "ul" ? "list-disc" : "list-decimal")}
              >
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, true, `${key}-${j}`)}</li>
                ))}
              </Tag>
            );
          }
          case "p":
            return (
              <p key={key}>
                {block.lines.map((line, j) => (
                  <Fragment key={`${key}-${j}`}>
                    {j > 0 ? <br /> : null}
                    {renderInline(line, true, `${key}-${j}`)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
