import { ScrollArea } from "../scroll-area";
import { Elevated } from "../surface";
import { Button } from "../button";
import {
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Copy01Icon, CheckmarkCircle02Icon } from "hugeicons-react";

export type DiffLine = {
  text: string;
  kind: "context" | "add" | "remove";
  old?: number;
  next?: number;
};

export function diffLines(before: string, after: string): DiffLine[] {
  const old = before ? before.split("\n") : [];
  const next = after ? after.split("\n") : [];
  let start = 0,
    end = 0;
  while (
    start < old.length &&
    start < next.length &&
    old[start] === next[start]
  )
    start++;
  while (
    end < old.length - start &&
    end < next.length - start &&
    old[old.length - end - 1] === next[next.length - end - 1]
  )
    end++;
  // ponytail: linear prefix/suffix diff keeps large recipes bounded; use a diff library if minimal hunks become necessary.
  return [
    ...old.slice(0, start).map((text, i) => ({
      text,
      kind: "context" as const,
      old: i + 1,
      next: i + 1,
    })),
    ...old.slice(start, old.length - end).map((text, i) => ({
      text,
      kind: "remove" as const,
      old: start + i + 1,
    })),
    ...next
      .slice(start, next.length - end)
      .map((text, i) => ({ text, kind: "add" as const, next: start + i + 1 })),
    ...next.slice(next.length - end).map((text, i) => ({
      text,
      kind: "context" as const,
      old: old.length - end + i + 1,
      next: next.length - end + i + 1,
    })),
  ];
}

export function CodeBlock({
  code,
  before,
  filename = "Code",
}: {
  code: string;
  before?: string;
  filename?: string;
}) {
  const [copyState, setCopyState] = useState("");
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timeout.current), []);
  const lines: DiffLine[] =
    before === undefined
      ? code
          .split("\n")
          .map((text, i) => ({ text, kind: "context", next: i + 1 }))
      : diffLines(before, code);
  return (
    <Elevated
      offset={1}
      shadowLevel={2}
      render={<div />}
      className="my-2 min-inline-0 overflow-hidden rounded-lg text-[12px]"
    >
      <div className="flex min-block-9.5 items-center gap-2 border-b border-ui-hairline px-2.5 py-1.25 text-[11px] [&>span:first-child]:min-inline-0 [&>span:first-child]:font-mono [&>span:first-child]:wrap-anywhere">
        <span>{filename}</span>
        {before !== undefined && (
          <span className="shrink-0 font-mono [&_[data-tone=add]]:text-ui-success [&_[data-tone=remove]]:text-ui-danger">
            <span data-tone="add">
              +{lines.filter((line) => line.kind === "add").length}
            </span>{" "}
            <span data-tone="remove">
              −{lines.filter((line) => line.kind === "remove").length}
            </span>
          </span>
        )}
        <Button
          type="button"
          className="ml-auto"
          aria-label={`Copy ${filename}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopyState("Copied");
            } catch {
              setCopyState("Copy failed. Select the text to copy it.");
            }
            clearTimeout(timeout.current);
            timeout.current = setTimeout(() => setCopyState(""), 2500);
          }}
          variant="ghost"
          size="sm"
        >
          {copyState === "Copied" ? (
            <CheckmarkCircle02Icon size={14} aria-hidden="true" />
          ) : (
            <Copy01Icon size={14} aria-hidden="true" />
          )}
          <span>Copy</span>
        </Button>
      </div>
      {copyState && (
        <span role="status" className="block px-2.5 py-1 text-[11px]">
          {copyState}
        </span>
      )}
      <ScrollArea
        className="max-h-80"
        viewportClassName="max-h-80 scroll-fade"
        orientation="both"
        aria-label={
          before === undefined
            ? filename
            : `${filename}: removed and added lines`
        }
      >
        <div className="py-2.5 leading-[1.65]">
          {lines.map((line, i) => (
            <div
              key={i}
              className="flex min-block-lh items-start [&>code]:min-inline-0 [&>code]:ps-1.75 [&>code]:pe-2.5 [&>code]:font-mono [&>code]:text-[12px] [&>code]:leading-[1.7] [&>code]:wrap-anywhere [&>code]:whitespace-pre-wrap data-[kind=add]:border-s-2 data-[kind=add]:border-s-(--ui-success-text) data-[kind=add]:bg-[color-mix(in_srgb,var(--ui-success-text)_9%,transparent)] data-[kind=remove]:border-s-2 data-[kind=remove]:border-s-(--ui-danger-text) data-[kind=remove]:bg-ui-danger-tint"
              data-kind={line.kind}
            >
              <span
                className="inline-7.5 shrink-0 border-e border-ui-hairline px-1.25 text-end font-mono text-[10px] leading-[1.98] text-ui-default select-none"
                aria-hidden="true"
              >
                {line.kind === "remove" ? line.old : line.next}
              </span>
              {before !== undefined && (
                <span
                  className="inline-4.25 shrink-0 text-center select-none"
                  aria-label={
                    line.kind === "add"
                      ? "Added"
                      : line.kind === "remove"
                        ? "Removed"
                        : undefined
                  }
                >
                  {line.kind === "add"
                    ? "+"
                    : line.kind === "remove"
                      ? "−"
                      : " "}
                </span>
              )}
              <code>{line.text || "\n"}</code>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Elevated>
  );
}

export function MarkdownCodeBlock({ children }: { children?: ReactNode }) {
  if (
    !isValidElement<{ children?: string; className?: string }>(children) ||
    typeof children.props.children !== "string"
  )
    return <pre>{children}</pre>;
  return (
    <CodeBlock
      code={children.props.children}
      filename={children.props.className?.replace(/^language-/, "") || "Code"}
    />
  );
}
