import type {
  AnyFormBlock,
  ContentBase,
  LogicBlock,
  NativeContent,
  NativeQuestion,
  QuestionBase,
  QuestionOption,
} from "../schema";

/** Ordinary native JSON factories: no storage settings, source envelope, or template linkage. */
export function question<K extends string, C = never>(
  value: Omit<NativeQuestion<K, C>, "type" | "label"> & { label?: QuestionBase["label"] },
): NativeQuestion<K, C> {
  return { ...value, type: "question", label: value.label ?? "" };
}

export function option(value: QuestionOption): QuestionOption {
  return { ...value };
}

export function content<K extends string, C = never>(
  value: Omit<NativeContent<K, C>, "type" | "content"> & { content?: ContentBase["content"] },
): NativeContent<K, C> {
  return { ...value, type: "content", content: value.content ?? "" };
}

export function group(...blocks: (AnyFormBlock | readonly AnyFormBlock[])[]): AnyFormBlock[] {
  return blocks.flatMap((block) => ("type" in block ? [block] : [...block]));
}

export function rule(value: Omit<LogicBlock, "type">): LogicBlock {
  return { ...value, type: "logic" };
}
