import { Fragment, type ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /\*\*([^*\n]+)\*\*/g;
  let lastIndex = 0;
  let idx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t-${idx++}`}>{text.slice(lastIndex, match.index)}</Fragment>
      );
    }
    nodes.push(
      <strong key={`${keyPrefix}-b-${idx++}`} className="font-semibold text-foreground">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t-${idx}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return nodes;
}

type Block =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; items: string[] };

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let list: string[] | null = null;

  const flushParagraph = () => {
    if (buffer.length > 0) {
      blocks.push({ kind: "paragraph", lines: buffer });
      buffer = [];
    }
  };
  const flushList = () => {
    if (list && list.length > 0) {
      blocks.push({ kind: "list", items: list });
    }
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    const bulletMatch = /^\s*[-*•]\s+(.+)$/.exec(line);

    if (bulletMatch) {
      flushParagraph();
      if (!list) list = [];
      list.push(bulletMatch[1] ?? "");
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    buffer.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

export function renderMarkdown(text: string): ReactNode {
  const blocks = parseBlocks(text);

  return (
    <>
      {blocks.map((block, blockIdx) => {
        if (block.kind === "list") {
          return (
            <ul key={`b-${blockIdx}`} className="my-2 list-disc space-y-1 pl-5">
              {block.items.map((item, itemIdx) => (
                <li key={`b-${blockIdx}-i-${itemIdx}`} className="leading-relaxed">
                  {renderInline(item, `b-${blockIdx}-i-${itemIdx}`)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`b-${blockIdx}`} className="leading-relaxed [&:not(:last-child)]:mb-2">
            {block.lines.map((line, lineIdx) => (
              <Fragment key={`b-${blockIdx}-l-${lineIdx}`}>
                {lineIdx > 0 && <br />}
                {renderInline(line, `b-${blockIdx}-l-${lineIdx}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}
