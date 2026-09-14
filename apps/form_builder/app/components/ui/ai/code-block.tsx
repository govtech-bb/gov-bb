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
import {
  Copy01Icon,
  CheckmarkCircle02Icon,
  SourceCodeIcon,
} from "hugeicons-react";

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
      className="my-3 min-inline-0 overflow-hidden rounded-xl text-[12px]"
    >
      <div className="flex min-block-11 items-center gap-2 border-b border-ui-hairline px-3 text-[12px]">
        <SourceCodeIcon
          size={15}
          className="shrink-0 text-ui-subtle"
          aria-hidden="true"
        />
        <span className="min-inline-0 truncate font-mono" title={filename}>
          {filename}
        </span>
        {before !== undefined && (
          <span className="flex shrink-0 gap-2 font-mono text-[11px] tabular-nums [&_[data-tone=add]]:text-ui-success [&_[data-tone=remove]]:text-ui-danger">
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
          className="ms-auto h-7 gap-1 px-1.5 text-[12px] data-[copied=true]:text-ui-success"
          data-copied={copyState === "Copied"}
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
          <span>{copyState === "Copied" ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      {copyState && (
        <span
          role="status"
          className={
            copyState === "Copied"
              ? "sr-only"
              : "block px-3 py-2 text-[12px] text-ui-danger"
          }
        >
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
        <div className="py-3 font-mono leading-[1.65]">
          {lines.map((line, i) => (
            <div
              key={i}
              className="relative flex min-block-lh items-start [&>code]:min-inline-0 [&>code]:ps-2 [&>code]:pe-3 [&>code]:font-mono [&>code]:text-[12px] [&>code]:leading-[1.7] [&>code]:wrap-anywhere [&>code]:whitespace-pre-wrap data-[kind=add]:bg-ui-success-tint data-[kind=remove]:bg-ui-danger-tint"
              data-kind={line.kind}
            >
              {line.kind !== "context" && (
                <span
                  aria-hidden="true"
                  data-kind={line.kind}
                  className="absolute inset-y-0 start-0 inline-0.5 bg-ui-success data-[kind=remove]:bg-ui-danger"
                />
              )}
              <span
                className="inline-7 shrink-0 border-e border-ui-hairline px-1 text-end text-[11px] leading-[1.85] text-ui-subtle select-none"
                aria-hidden="true"
              >
                {line.kind === "remove" ? line.old : line.next}
              </span>
              {before !== undefined && (
                <span
                  className="inline-4 shrink-0 text-end text-ui-subtle select-none data-[kind=add]:text-ui-success data-[kind=remove]:text-ui-danger"
                  data-kind={line.kind}
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
