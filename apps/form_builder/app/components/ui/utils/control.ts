/** Shared dimensions for controls that sit together in a form or toolbar. */
export const controlSizes = {
  xs: "h-6 gap-1 rounded-md px-1.5 text-xs",
  sm: "h-7 gap-1 rounded-lg px-2 text-sm",
  base: "h-9 gap-1.5 rounded-lg px-3 text-base",
  lg: "h-10 gap-2 rounded-lg px-4 text-base",
} as const;

export type ControlSize = keyof typeof controlSizes;
