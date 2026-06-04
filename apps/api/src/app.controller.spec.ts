import { AppController } from "./app.controller";

describe("AppController", () => {
  let controller: AppController;

  beforeEach(() => {
    controller = new AppController();
  });

  it("health() returns 'OK'", () => {
    expect(controller.health()).toBe("OK");
  });
});
