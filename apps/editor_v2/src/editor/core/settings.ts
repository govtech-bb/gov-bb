/** Raw authored settings remain JSON, including incomplete and legacy values. */
export type Setting = string | number | boolean | null | Setting[] | { [key: string]: Setting };

export type Settings = Record<string, Setting>;
