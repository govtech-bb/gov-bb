import type { DataSource } from "typeorm";
import { WaterSentAlertRepository } from "./water-sent-alert.repository";

it("restricts failed-send retries to confirmed subscribers and active notices", async () => {
  const query = vi.fn().mockResolvedValue([]);
  const repository = new WaterSentAlertRepository({
    createEntityManager: () => ({ query }),
  } as unknown as DataSource);

  await repository.pendingUnsent(["notice-1"]);

  expect(query).toHaveBeenCalledWith(
    expect.stringContaining("s.\"status\" = 'confirmed'"),
    [["notice-1"]],
  );
  expect(query.mock.calls[0][0]).toContain('sa."sent" = false');
  expect(query.mock.calls[0][0]).toContain('sa."notice_id" = ANY($1::text[])');
});
