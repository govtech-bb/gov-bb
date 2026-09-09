/** @vitest-environment jsdom */
import { act, render, screen } from "@testing-library/react";
import { ToolPreview } from "./-tool-preview";
import { smartTool } from "@govtech-bb/content/smart-tools";

it("sends drafts only to the preview frame and accepts its versioned handshake", () => {
  vi.useFakeTimers();
  try {
    const content = { schemaVersion: 1, copy: { title: "Draft" } };
    const view = render(
      <ToolPreview definition={smartTool("pharmacies")} content={content} />,
    );
    const frame = screen.getByTitle(
      "Find an open pharmacy preview",
    ) as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    const origin = new URL(frame.src).origin;
    const send = (
      messageOrigin = origin,
      source: MessageEventSource | null = frame.contentWindow,
      version = 1,
    ) =>
      act(() =>
        window.dispatchEvent(
          new MessageEvent("message", {
            origin: messageOrigin,
            source,
            data: { source: "gov-bb-smart-tool-preview", version },
          }),
        ),
      );
    send("https://another.example.test");
    send(origin, window);
    send(origin, frame.contentWindow, 2);
    expect(post).not.toHaveBeenCalled();
    send();
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ version: 1, id: "pharmacies", content }),
      origin,
    );
    const edited = { ...content, copy: { title: "Edited" } };
    view.rerender(
      <ToolPreview definition={smartTool("pharmacies")} content={edited} />,
    );
    act(() => vi.advanceTimersByTime(150));
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: edited }),
      origin,
    );
  } finally {
    vi.useRealTimers();
  }
});
