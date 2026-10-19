import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

type Modifier = "metaKey" | "ctrlKey" | "altKey" | "shiftKey";

const load = async (userAgent: string) => {
  vi.stubGlobal("navigator", { userAgent });
  vi.resetModules();

  return import("../../src/editor/react/shortcut");
};

test("shortcuts are written the way the platform names its keys", async () => {
  const windows = await load("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

  expect(windows.isMac).toBe(false);
  expect(windows.shortcut(["mod", "shift", "h"])).toBe("Ctrl+Shift+H");
  expect(windows.shortcut(["alt", "enter"])).toBe("Alt+Enter");
  expect(windows.shortcut(["delete"])).toBe("Del");
  expect(windows.shortcut(["mod", "["])).toBe("Ctrl+[");

  const mac = await load("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)");

  expect(mac.isMac).toBe(true);
  expect(mac.shortcut(["mod", "shift", "h"])).toBe("⌘⇧H");
  expect(mac.shortcut(["alt", "enter"])).toBe("⌥↵");
  expect(mac.shortcut(["delete"])).toBe("⌫");
  expect(mac.shortcut(["mod", "alt", "["])).toBe("⌘⌥[");
});

test("a key press matches a shortcut by its modifiers, and a digit by its key whatever Option or Shift types", async () => {
  const press = (keys: { key: string; code: string } & Partial<Record<Modifier, boolean>>) => ({
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...keys,
  });

  const mac = await load("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)");

  // Option-2 types ™ on a Mac, and Shift-8 types *
  expect(
    mac.pressedShortcut(press({ key: "™", code: "Digit2", metaKey: true, altKey: true }), [
      "mod",
      "alt",
      "2",
    ]),
  ).toBe(true);
  expect(
    mac.pressedShortcut(press({ key: "*", code: "Digit8", metaKey: true, shiftKey: true }), [
      "mod",
      "shift",
      "8",
    ]),
  ).toBe(true);
  expect(
    mac.pressedShortcut(press({ key: "B", code: "KeyB", metaKey: true, shiftKey: true }), [
      "mod",
      "shift",
      "b",
    ]),
  ).toBe(true);
  // Missing or extra modifiers, and Ctrl in place of ⌘, aren't the shortcut
  expect(
    mac.pressedShortcut(press({ key: "2", code: "Digit2", metaKey: true }), ["mod", "alt", "2"]),
  ).toBe(false);
  expect(
    mac.pressedShortcut(
      press({ key: "2", code: "Digit2", metaKey: true, altKey: true, shiftKey: true }),
      ["mod", "alt", "2"],
    ),
  ).toBe(false);
  expect(
    mac.pressedShortcut(press({ key: "2", code: "Digit2", ctrlKey: true, altKey: true }), [
      "mod",
      "alt",
      "2",
    ]),
  ).toBe(false);

  const windows = await load("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

  expect(
    windows.pressedShortcut(press({ key: "2", code: "Digit2", ctrlKey: true, altKey: true }), [
      "mod",
      "alt",
      "2",
    ]),
  ).toBe(true);
});
