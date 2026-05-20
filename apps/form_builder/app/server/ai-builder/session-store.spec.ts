import { create, get, getOrThrow, _resetForTests } from "./session-store";

describe("session-store", () => {
  beforeEach(() => _resetForTests());

  it("create() returns a session with a UUID id and the given name", () => {
    const session = create("My session");
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.name).toBe("My session");
    expect(session.messages).toEqual([]);
    expect(session.recipe).toBeNull();
    expect(session.systemPrompt).toBe("");
  });

  it("create() with no name generates a timestamp-based name", () => {
    const session = create();
    expect(session.name).toMatch(/^Session /);
  });

  it("get() returns null for unknown ids", () => {
    expect(get("does-not-exist")).toBeNull();
  });

  it("get() returns the session after create()", () => {
    const session = create();
    expect(get(session.id)).toBe(session);
  });

  it("getOrThrow() throws on unknown id", () => {
    expect(() => getOrThrow("nope")).toThrow("Session nope not found");
  });
});
