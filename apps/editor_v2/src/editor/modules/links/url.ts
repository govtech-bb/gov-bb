export function isSafeLinkUrl(value: string) {
  return (
    ![...value].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) && !/^(?:javascript|data|vbscript):/i.test(value.trim())
  );
}

export function isSupportedLinkUrl(value: string) {
  return (
    ![...value].some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    ) &&
    !value.startsWith("//") &&
    (!/^[a-z][a-z\d+.-]*:/i.test(value) || /^(https?|mailto|tel|ircs?|xmpp):/i.test(value))
  );
}
