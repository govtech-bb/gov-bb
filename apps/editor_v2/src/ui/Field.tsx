import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-[6px]", className)}>
      <label
        htmlFor={htmlFor}
        className="text-caption-sm font-bold uppercase tracking-[0.08em] text-mid-grey-00"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <span className="text-caption-sm text-mid-grey-00">{hint}</span>
      )}
      {error && (
        <span role="alert" className="text-caption-sm text-red-00 font-bold">
          {error}
        </span>
      )}
    </div>
  );
}

const base =
  "w-full bg-white-00 border border-grey-00 px-xs text-caption text-black-00 " +
  "placeholder:text-mid-grey-00 transition-colors " +
  "hover:border-mid-grey-00 " +
  "focus:outline-2 focus:outline-offset-2 focus:outline-teal-100 focus:border-blue-100 " +
  "disabled-state read-only:bg-blue-10/30 read-only:hover:border-grey-00";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={cn(base, "h-10", className)} />;
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={cn(base, "py-xs font-mono text-caption-sm", className)}
    />
  );
});
