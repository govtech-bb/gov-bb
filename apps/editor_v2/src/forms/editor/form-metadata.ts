import { $getRoot, $getEditor } from "lexical";
import { $isFormTitleNode, $setSettings, $settings } from "./nodes";
import { formSettingsOf, type FormSettings } from "../core/form-settings";
import { $native, $setNative } from "./native-state";
import { nativeFormSettings, applyNativeFormSettings } from "./native-form-settings";

export function $formSettings(): FormSettings {
  const title = $getRoot().getFirstChild();
  const native = title && $native(title).form;

  if (native) return nativeFormSettings(native);

  return title && $isFormTitleNode(title) ? formSettingsOf($settings(title)) : {};
}

// ponytail: replacing the title drops its settings too; undo brings the old title and settings back.
export function $setFormSettings(patch: Partial<FormSettings>) {
  if (!$getEditor().isEditable()) return;
  const title = $getRoot().getFirstChild();

  if (!title || !$isFormTitleNode(title)) return;
  const native = $native(title).form;

  if (native) {
    const form = applyNativeFormSettings(native, patch);
    $setNative(title, { form });
    $setSettings(title, { formSettings: nativeFormSettings(form) });

    return;
  }

  const settings = formSettingsOf({ formSettings: { ...$formSettings(), ...patch } });
  $setSettings(title, {
    formSettings: Object.keys(settings).length ? settings : undefined,
  });
}
