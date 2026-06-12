/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { usePresence, PRESENCE_SYNC_MS } from "./-use-presence";
import { claimPresence, releasePresence } from "../../server/presence";

vi.mock("../../server/presence", () => ({
  claimPresence: vi.fn(),
  releasePresence: vi.fn(),
}));

const claimMock = vi.mocked(claimPresence);
const releaseMock = vi.mocked(releasePresence);

const HOLDER_ME = {
  userLogin: "alice",
  claimedAt: "2026-06-08T10:00:00.000Z",
  lastActivityAt: "2026-06-08T10:00:00.000Z",
};
const HOLDER_OTHER = { ...HOLDER_ME, userLogin: "bob" };

beforeEach(() => {
  claimMock.mockReset();
  releaseMock.mockReset();
  releaseMock.mockResolvedValue({ released: true });
});

// Flush pending promise microtasks (claim/release resolutions) under the
// renderer's act() so the resulting setState is applied.
const flush = () => act(async () => {});

describe("usePresence", () => {
  it("does not claim when formId is null and reports editable", async () => {
    const { result } = renderHook(() => usePresence(null));
    await flush();
    expect(claimMock).not.toHaveBeenCalled();
    expect(result.current.isReadOnly).toBe(false);
    expect(result.current.holder).toBeNull();
  });

  it("claims on mount; when held, the session is editable and shows me as holder", async () => {
    claimMock.mockResolvedValue({ held: true, holder: HOLDER_ME });
    const { result } = renderHook(() => usePresence("marriage-license"));
    await flush();
    expect(claimMock).toHaveBeenCalledWith({
      data: { formId: "marriage-license" },
    });
    expect(result.current.isReadOnly).toBe(false);
    expect(result.current.holder).toEqual(HOLDER_ME);
  });

  it("goes read-only with the other holder when someone else holds a fresh claim", async () => {
    claimMock.mockResolvedValue({ held: false, holder: HOLDER_OTHER });
    const { result } = renderHook(() => usePresence("marriage-license"));
    await waitFor(() => expect(result.current.isReadOnly).toBe(true));
    expect(result.current.holder).toEqual(HOLDER_OTHER);
  });

  it("re-syncs on the interval (heartbeat / poll)", async () => {
    vi.useFakeTimers();
    try {
      claimMock.mockResolvedValue({ held: true, holder: HOLDER_ME });
      renderHook(() => usePresence("marriage-license"));
      await flush(); // initial sync
      expect(claimMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(PRESENCE_SYNC_MS);
      });
      expect(claimMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("auto-takes-over: read-only flips to editable once the claim comes free", async () => {
    vi.useFakeTimers();
    try {
      claimMock
        .mockResolvedValueOnce({ held: false, holder: HOLDER_OTHER })
        .mockResolvedValue({ held: true, holder: HOLDER_ME });
      const { result } = renderHook(() => usePresence("marriage-license"));
      await flush();
      expect(result.current.isReadOnly).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(PRESENCE_SYNC_MS);
      });
      expect(result.current.isReadOnly).toBe(false);
      expect(result.current.holder).toEqual(HOLDER_ME);
    } finally {
      vi.useRealTimers();
    }
  });

  it("best-effort releases the claim on unmount", async () => {
    claimMock.mockResolvedValue({ held: true, holder: HOLDER_ME });
    const { unmount } = renderHook(() => usePresence("marriage-license"));
    await flush();
    unmount();
    await flush();
    expect(releaseMock).toHaveBeenCalledWith({
      data: { formId: "marriage-license" },
    });
  });

  it("does not flip read-only when a sync fails transiently", async () => {
    claimMock.mockRejectedValue(new Error("network blip"));
    const { result } = renderHook(() => usePresence("marriage-license"));
    await flush();
    expect(result.current.isReadOnly).toBe(false);
  });
});
