import { ServiceUnavailableException } from "@nestjs/common";
import type { DataSource } from "typeorm";
import { AppController, READINESS_TIMEOUT_MS } from "./app.controller";

// Build a controller with a DataSource stubbed to just its `query` method.
function makeController(query: DataSource["query"]): AppController {
  return new AppController({ query } as unknown as DataSource);
}

describe("AppController", () => {
  it("health() returns 'OK' (liveness, no DB check)", () => {
    const controller = makeController(vi.fn());
    expect(controller.health()).toBe("OK");
  });

  describe("ready()", () => {
    it("returns 'OK' when the database is reachable", async () => {
      const query = vi.fn().mockResolvedValue([{ "?column?": 1 }]);
      await expect(makeController(query).ready()).resolves.toBe("OK");
      expect(query).toHaveBeenCalledWith("SELECT 1");
    });

    it("throws 503 when the database is unreachable", async () => {
      const query = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      await expect(makeController(query).ready()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it("throws 503 when the database query hangs past the timeout", async () => {
      vi.useFakeTimers();
      try {
        // A query that never settles — a hung connection, not a refused one.
        const query = vi.fn().mockReturnValue(new Promise<never>(() => {}));
        const assertion = expect(
          makeController(query).ready(),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        await vi.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS + 1);
        await assertion;
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
