import { defaultUrlTransform } from "react-markdown";

// react-markdown blanks the href of any protocol outside its safe list, which
// covers mailto: but not tel: — a recipe that links a phone number would render
// `<a href="">`. Let tel: through and defer to the default for everything else,
// so javascript: and friends are still stripped.
export function markdownUrlTransform(url: string): string {
  return url.startsWith("tel:") ? url : defaultUrlTransform(url);
}
