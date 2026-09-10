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
import s from "./components.module.css";

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
      className={s.codeBlock}
    >
      <div className={s.codeHeader}>
        <span>{filename}</span>
        {before !== undefined && (
          <span className={s.diffStats}>
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
        <span role="status" className={s.copyStatus}>
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
        <div className={s.codeLines}>
          {lines.map((line, i) => (
            <div key={i} className={s.codeLine} data-kind={line.kind}>
              <span
                className={`${s.lineNumber} select-none`}
                aria-hidden="true"
              >
                {line.kind === "remove" ? line.old : line.next}
              </span>
              {before !== undefined && (
                <span
                  className={`${s.lineSign} select-none`}
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
