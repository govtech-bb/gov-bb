/** Single-context HTTP lock fixture; cross-user/concurrent guarantees are checked by the real-API suite. */
export async function installPageEditLocks(context) {
  const locks = new Map();
  await context.route("**/pages/*/lock", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    const headers = {
      "access-control-allow-origin": request.headers().origin ?? "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type, x-page-edit-lock-token",
      "cache-control": "no-store",
    };

    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    const now = Date.now();
    const token = request.headers()["x-page-edit-lock-token"];
    const lock = locks.get(path) ?? { generation: 0, claim: undefined };
    const live = lock.claim && now < lock.claim.expires;
    const owned = live && token === lock.claim.token;

    const failure = (error) =>
      route.fulfill({ status: 409, headers, json: { error, pageId: path.split("/")[2] } });

    switch (request.method()) {
      case "POST": {
        const command = request.postDataJSON();

        if (!owned) {
          if (
            command.expectedLockGeneration !== lock.generation ||
            (live && command.action !== "takeover")
          )
            return failure("page_edit_lock_conflict");
          lock.generation++;
          lock.claim = { token, expires: now + 120000, activity: now, sequence: 0 };
        }

        break;
      }

      case "PUT": {
        if (!owned) return failure("page_edit_lock_lost");
        const { activitySequence } = request.postDataJSON();

        if (activitySequence > lock.claim.sequence) {
          lock.claim.activity = now;
          lock.claim.sequence = activitySequence;
        }

        lock.claim.expires = Math.min(now + 120000, lock.claim.activity + 720000);
        break;
      }

      case "DELETE":
        if (lock.claim?.token === token) lock.claim = undefined;
        break;
    }

    locks.set(path, lock);
    const common = { lockGeneration: lock.generation, serverTime: new Date(now).toISOString() };
    const claim = lock.claim;

    const status =
      !claim || now >= claim.expires
        ? { ...common, state: "unheld" }
        : {
            ...common,
            state: "held",
            holderName: "Test employee",
            ownedByCaller: claim.token === token,
            lockExpiresAt: new Date(claim.expires).toISOString(),
            lastActivityAt: new Date(claim.activity).toISOString(),
            idlePromptAt: new Date(claim.activity + 600000).toISOString(),
            idleExpiresAt: new Date(claim.activity + 720000).toISOString(),
            activitySequence: claim.sequence,
          };

    return route.fulfill({ status: 200, headers, json: status });
  });
}
