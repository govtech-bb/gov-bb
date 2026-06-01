import React from "react";
import { useMaskito } from "@maskito/react";

const MASK_CHAR_MAP: Record<string, RegExp> = {
  "9": /\d/,
  A: /[a-zA-Z]/,
  "*": /[a-zA-Z0-9]/,
};

export function parseMask(maskString: string): Array<string | RegExp> {
  return Array.from(maskString).map((ch) => MASK_CHAR_MAP[ch] ?? ch);
}

type MaskedInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  mask?: string;
};

export function MaskedInput({ mask, ...rest }: MaskedInputProps) {
  if (mask) return <MaskedInputInner mask={mask} {...rest} />;
  return <input {...rest} />;
}

function MaskedInputInner({
  mask,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { mask: string }) {
  const maskArray = React.useMemo(() => parseMask(mask), [mask]);
  const ref = useMaskito({ options: { mask: maskArray } });
  return <input ref={ref} {...rest} />;
}
