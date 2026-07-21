import { ServiceUnavailableException } from "@nestjs/common";
import type { DataSource } from "typeorm";
import { AppController } from "./app.controller";

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
  });
});
