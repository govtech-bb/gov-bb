import { useEffect, useState } from "react";
import { Text } from "@govtech-bb/react";
import { betaNoticeStore } from "#/lib/chat/persistence";

// Friendly "this is new" heads-up shown once per session (issue #1066). Self-
// contained: it renders nothing on the server and on the first client render
// (sessionStorage isn't readable during SSR/hydration), then reveals after
// mount if the session hasn't dismissed it — so there's no hydration mismatch.
export function BetaNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!betaNoticeStore.isDismissed()) setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    betaNoticeStore.dismiss();
    setVisible(false);
  };

  return (
    <div className="border-blue-20 border-b bg-blue-10">
      <div className="container flex items-start gap-s py-xs">
        <Text as="p" size="caption" className="flex-1 text-pretty text-black-00">
          <strong>This assistant is new.</strong> It is still learning, so it
          may sometimes get things wrong. Please double check anything important.
        </Text>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss this notice"
          className="shrink-0 px-xs text-black-00 leading-none"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
    </div>
  );
}
