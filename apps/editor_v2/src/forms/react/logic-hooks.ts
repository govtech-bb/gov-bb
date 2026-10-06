import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import type { EditorUpdateOptions } from "lexical";

/** Re-reads the editor on every change. The read goes through JSON, so an unchanged read is the same value. */
export function useRead<T>(read: () => T): T {
  const [editor] = useLexicalComposerContext();

  const snapshot = useSyncExternalStore(
    (onChange) => editor.registerUpdateListener(onChange),
    () => editor.getEditorState().read(() => JSON.stringify(read()), { editor }),
  );

  // SAFETY: snapshot is produced only by serializing this hook’s typed read callback above.
  return useMemo(() => JSON.parse(snapshot) as T, [snapshot]);
}

export function useEditable() {
  const [editor] = useLexicalComposerContext();

  return useSyncExternalStore(
    (listener) => editor.registerEditableListener(listener),
    () => editor.isEditable(),
    () => false,
  );
}

export function useEditableUpdate() {
  const [editor] = useLexicalComposerContext();

  return useCallback(
    (write: () => void, options?: EditorUpdateOptions) => {
      if (!editor.isEditable()) return;
      editor.update(() => {
        if (editor.isEditable()) write();
      }, options);
    },
    [editor],
  );
}

export function useSettled<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);

    return () => clearTimeout(timer);
  }, [value, ms]);

  return settled;
}

/** Close only when a press starts and ends outside, so dragging out does not dismiss the control. */
export function useOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void) {
  const close = useEffectEvent(onOutside);

  useEffect(() => {
    let outside = false;
    const pending = new Set<ReturnType<typeof setTimeout>>();

    const down = (e: Event) =>
      e.target instanceof Element && (outside = ref.current?.contains(e.target) === false);

    const up = (e: Event) => {
      if (!(e.target instanceof Element) || ref.current?.contains(e.target) || !outside) return;

      const timer = setTimeout(() => {
        pending.delete(timer);
        close();
      }, 1);

      pending.add(timer);
    };

    const events = [
      ["mousedown", down],
      ["touchstart", down],
      ["mouseup", up],
      ["touchend", up],
    ] as const;

    for (const [name, listener] of events) document.addEventListener(name, listener);

    return () => {
      for (const [name, listener] of events) document.removeEventListener(name, listener);

      for (const timer of pending) clearTimeout(timer);
    };
  }, [ref]);
}

export function useEscape(onEscape: () => void) {
  useEffect(() => {
    const listener = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onEscape();
    document.addEventListener("keydown", listener);

    return () => document.removeEventListener("keydown", listener);
  });
}
