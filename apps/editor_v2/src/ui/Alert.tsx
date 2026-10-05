import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "error" | "info" | "warning";

const styles: Record<Tone, string> = {
  error: "bg-red-10 text-red-00 border-l-2 border-red-100",
  info: "bg-blue-10 text-blue-100 border-l-2 border-blue-100",
  warning: "bg-yellow-10 text-black-00 border-l-2 border-yellow-100",
};

export function Alert({
  tone = "info",
  children,
  className,
  ...rest
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      {...rest}
      className={cn(
        "flex flex-col gap-xs text-caption px-s py-xs",
        styles[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
