import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";

// This server is opt-in local tooling. Normal dev/build never loads its mocks.
const root = fileURLToPath(new URL("../", import.meta.url));
const contract = JSON.parse(
  await readFile(
    new URL("../contracts/showcase-contract.json", import.meta.url),
    "utf8",
  ),
);
const api = "/__demo-api";
const paymentUrl = "https://payments.example.test/demo";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
  "base64",
);
const files = new Map();
const uploaded = new Set();
const sampleFile = {
  key: "demo-sample",
  name: "demo.png",
  size: png.length,
  type: "image/png",
};
const answers = {
  "contact_first-name": "Alex",
  "contact_last-name": "Example",
  contact_email: "alex@example.test",
  "contact_contact-method": "email",
  contact_telephone: "+14165550123",
  contact_reference: "123456-7890",
  contact_initials: "AE",
  "choices_applicant-type": "organisation",
  "choices_organisation-name": "Example Community Group",
  "choices_event-name": "Demo community day",
  "choices_event-type": "other",
  "choices_other-event": "An imaginary community event",
  choices_support: ["access", "interpreter"],
  choices_language: "Spanish",
  choices_activities: ["cooking", "crafts", "information"],
  organisation_registration: "ORG-123",
  "dates_date-of-birth": { day: "15", month: "6", year: "1990" },
  "dates_start-date": { day: "10", month: "10", year: "2099" },
  "dates_end-date": { day: "11", month: "10", year: "2099" },
  "dates_start-time": "09:00",
  dates_attendance: "50",
  "venue_address-line-1": "10 Demo Lane",
  "venue_address-line-2": "Bridgetown",
  venue_parish: "st-michael",
  venue_coordinates: "13.1,-59.6",
  "venue_directions-toggle": true,
  venue_directions: "Use the side entrance.",
  "hours_opening-hours": [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
  ].map((day) => `${day} 09:00 - 17:00`),
  uploads_plan: [sampleFile],
  "repeated-answers_aliases": ["Community day", "Demo day"],
  "repeated-answers_notes": ["Bring a table.", "Set up a quiet area."],
  "repeated-answers_quantities": ["2", "3"],
  "repeated-answers_emails": ["helper@example.test"],
  "repeated-answers_phones": ["+14165550124"],
  "volunteers_team-name": "Demo volunteers",
  "volunteers~1_volunteer-name": "Sam Example",
  "volunteers~1_volunteer-email": "sam@example.test",
  "volunteers~1_addAnother": "no",
  declaration_consent: "yes",
  "declaration_submission-outcome": "success",
};
const completed = [
  ...contract.steps.map((step) => step.stepId),
  "volunteers~1",
];
const states = {
  success: {},
  "no-reference": {},
  processing: { processing: true },
  failure: { submissionSuccess: false },
  "payment-pending": { hasPayment: true, paymentSuccess: false, paymentUrl },
  "payment-success": { hasPayment: true, paymentSuccess: true },
  "payment-failed": { hasPayment: true, paymentSuccess: false },
  "payment-unavailable": {
    hasPayment: true,
    submissionSuccess: true,
    paymentSuccess: false,
  },
};

function json(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024 * 1024) throw new Error("Demo request is too large");
  }
  return JSON.parse(body);
}

function launch(res, scenario) {
  const reset = scenario === "reset";
  const formId =
    scenario === "no-reference" ? "showcase-no-reference" : contract.formId;
  const state =
    scenario in states
      ? {
          hasPayment: false,
          submissionSuccess: true,
          serviceName: contract.title,
          referenceNumber: "DEMO-001",
          date: new Date().toISOString(),
          amount: "20.00",
          unitPrice: "20.00",
          quantity: 1,
          paymentDescription: "Fake community event fee",
          polyclinic: "Demo district office",
          resolvedMarkdown:
            "## About this demo\n\nThis is a saved sample outcome. No application or payment was sent.\n\n[Return to the demo](/forms/showcase).",
          ...states[scenario],
        }
      : null;
  const target = `/forms/${formId}${reset ? "" : `?step=${state ? "submission-confirmation" : "contact"}`}`;
  res.writeHead(200, {
    "Content-Type": "text/html",
    "Cache-Control": "no-store",
  });
  // Every interpolated value is a fixed demo constant, never user input.
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Opening the demo</title>
    <p>Opening the demo…</p><script>
    for (const id of ["showcase", "showcase-no-reference"]) {
      for (const prefix of ["formData_", "completedSteps_", "submissionState_", "formStart_"]) sessionStorage.removeItem(prefix + id);
    }
    if (${!reset}) {
      sessionStorage.setItem("formData_${formId}", ${JSON.stringify(JSON.stringify(answers))});
      sessionStorage.setItem("completedSteps_${formId}", ${JSON.stringify(JSON.stringify(completed))});
    }
    if (${!!state}) sessionStorage.setItem("submissionState_${formId}", ${JSON.stringify(JSON.stringify(state))});
    location.replace(${JSON.stringify(target)});
    </script></html>`);
}

async function handle(req, res, next) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  if (path === "/__demo/start" || path === "/__demo/reset")
    return launch(res, path.split("/").at(-1));
  if (
    path.startsWith("/__demo/state/") &&
    Object.hasOwn(states, path.split("/").at(-1))
  )
    return launch(res, path.split("/").at(-1));
  if (path === "/__demo/contract.json") {
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="showcase-contract.json"',
    );
    return json(res, contract);
  }
  if (path.startsWith("/__demo/files/")) {
    const name = path.split("/").at(-1);
    if (
      ![
        "demo.png",
        "upload-fails.png",
        "too-large.png",
        "wrong-type.txt",
      ].includes(name)
    )
      return json(res, { message: "Unknown sample file" }, 404);
    res.writeHead(200, {
      "Content-Type": name.endsWith(".png") ? "image/png" : "text/plain",
      "Content-Disposition": `attachment; filename="${name}"`,
    });
    return res.end(
      name === "too-large.png"
        ? Buffer.concat([png, Buffer.alloc(1048576)])
        : name === "wrong-type.txt"
          ? "This file deliberately has the wrong type."
          : png,
    );
  }
  if (!path.startsWith(`${api}/`)) return next();
  if (req.method === "GET" && path === `${api}/form-definitions`)
    return json(res, {
      status: "success",
      data: [
        {
          formId: contract.formId,
          title: contract.title,
          category: "Local demo",
        },
      ],
    });
  if (req.method === "GET" && path.startsWith(`${api}/form-definitions/`)) {
    const id = path.split("/").at(-1);
    if (id === "showcase-error")
      return json(res, { message: "Intentional demo failure" }, 503);
    if (
      ![
        "showcase",
        "showcase-closed",
        "showcase-no-reference",
        "exit-survey",
      ].includes(id)
    )
      return json(res, { message: "Demo form not found" }, 404);
    const data = structuredClone(contract);
    data.formId = id;
    if (id === "showcase-closed") data.closingDateTime = "2020-01-01T00:00:00Z";
    if (id === "showcase-no-reference")
      data.steps.at(-1).hideReferenceNumber = true;
    if (id === "exit-survey") {
      data.title = "Fake feedback form";
      data.steps = [
        {
          stepId: "difficulty-rating",
          title: "How was the demo?",
          elements: [
            {
              fieldId: "rating",
              label: "How easy was it to use?",
              htmlType: "radio",
              options: [
                { label: "Easy", value: "easy" },
                { label: "Difficult", value: "difficult" },
              ],
            },
          ],
        },
        {
          stepId: "submission-confirmation",
          title: "Demo feedback received",
          elements: [],
        },
      ];
    }
    return json(res, { status: "success", data });
  }
  if (req.method === "GET" && path === `${api}/geocode`) {
    const q = (url.searchParams.get("q") || "").toLowerCase();
    if (q.includes("offline"))
      return json(res, { message: "Demo lookup unavailable" }, 503);
    return json(
      res,
      q.length < 3 || !q.includes("demo")
        ? []
        : [
            {
              label: "10 Demo Lane, Bridgetown, St Michael",
              line1: "10 Demo Lane",
              line2: "Bridgetown",
              parish: "st-michael",
              lat: "13.1",
              lon: "-59.6",
            },
            {
              label: "20 Demo Road, Oistins, Christ Church",
              line1: "20 Demo Road",
              line2: "Oistins",
              parish: "christ-church",
              lat: "13.06",
              lon: "-59.54",
            },
          ],
    );
  }
  if (req.method === "POST" && path === `${api}/files/presign-upload`) {
    const body = await readJson(req);
    if (
      typeof body.fileName !== "string" ||
      !["image/png", "application/pdf"].includes(body.contentType) ||
      !Number.isFinite(body.size) ||
      body.size <= 0 ||
      body.size > 1048576
    )
      return json(res, { message: "Use a PNG or PDF up to 1 MB" }, 400);
    const key = `demo-upload-${files.size + 1}`;
    files.set(key, {
      key,
      name: body.fileName,
      size: body.size,
      type: body.contentType,
    });
    return json(res, {
      status: "success",
      data: {
        key,
        uploadUrl: `${api}/uploads/${key}`,
        expiresIn: 3600,
        maxSize: 1048576,
      },
    });
  }
  if (req.method === "PUT" && path.startsWith(`${api}/uploads/`)) {
    const key = path.split("/").at(-1);
    if (!files.has(key)) return json(res, { message: "Unknown upload" }, 404);
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1048576) throw new Error("Demo upload is too large");
    }
    if (size !== files.get(key).size)
      return json(res, { message: "Upload size does not match" }, 400);
    await delay(1200);
    if (files.get(key).name === "upload-fails.png")
      return json(res, { message: "Intentional upload failure" }, 503);
    uploaded.add(key);
    return json(res, { status: "success" });
  }
  if (req.method === "POST" && path === `${api}/files/confirm-upload`) {
    const { key } = await readJson(req);
    if (!uploaded.has(key))
      return json(res, { message: "Upload has not completed" }, 400);
    return json(res, { status: "success", data: files.get(key) });
  }
  if (req.method === "POST" && path === `${api}/submissions`) {
    const { formId, values } = await readJson(req);
    if (
      ![contract.formId, "showcase-no-reference", "exit-survey"].includes(
        formId,
      ) ||
      !values ||
      typeof values !== "object" ||
      Array.isArray(values)
    )
      return json(res, { message: "Unknown demo submission" }, 400);
    const outcome = values.declaration?.["submission-outcome"] || "success";
    if (outcome === "validation-error")
      return json(
        res,
        {
          message: "Intentional demo validation error",
          meta: {
            errors: {
              declaration: {
                "submission-outcome": [
                  "This is a sample server error. Choose Successful submission to retry.",
                ],
              },
            },
          },
        },
        422,
      );
    await delay(500);
    const now = new Date().toISOString();
    return json(res, {
      status: "success",
      data: {
        id: "DEMO-001",
        referenceCode: "DEMO-001",
        createdAt: now,
        updatedAt: now,
        submittedAt: now,
        formId,
        idempotencyKey: req.headers["idempotency-key"] || "demo",
        values: {},
        meta: null,
        status:
          outcome === "failure"
            ? "failed"
            : outcome.startsWith("payment-")
              ? "pending_payment"
              : outcome,
      },
      meta: {
        resolvedPolyclinic: "Demo district office",
        ...(outcome === "payment-pending"
          ? {
              deferred: {
                amount: 20,
                paymentUrl,
                paymentId: "DEMO-PAYMENT",
                description: "Fake community event fee",
              },
            }
          : {}),
      },
    });
  }
  return json(
    res,
    { message: "This endpoint is not part of the local demo" },
    404,
  );
}

const server = await createServer({
  root,
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify(api),
    "import.meta.env.VITE_PAYMENT_ALLOWED_ORIGINS": JSON.stringify(
      "payments.example.test",
    ),
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.DEMO_PORT || 4175),
    strictPort: true,
  },
  plugins: [
    {
      name: "local-forms-demo",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          handle(req, res, next).catch(() =>
            json(res, { message: "Invalid demo request" }, 400),
          );
        });
      },
      transformIndexHtml() {
        return [
          {
            tag: "script",
            attrs: { type: "module" },
            children: `
        document.addEventListener("click", (event) => {
          const link = event.target instanceof Element ? event.target.closest("a") : null;
          if (link?.href === ${JSON.stringify(paymentUrl)}) {
            event.preventDefault();
            location.href = "/__demo/state/payment-success";
          }
        }, true);
      `,
          },
        ];
      },
    },
  ],
});
await server.listen();
const origin = server.resolvedUrls.local[0];
console.log(
  `\nFake form: ${origin}forms/showcase\nSample answers: ${origin}__demo/start\nNo real uploads, submissions or payments.\n`,
);

if (process.argv.includes("--check")) {
  try {
    const get = (path) => fetch(new URL(path, origin));
    const post = (path, body) =>
      fetch(new URL(path, origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await (await get(`${api}/form-definitions/showcase`)).json()).data
        .formId,
      "showcase",
    );
    assert.equal(
      (await get(`${api}/form-definitions/showcase-missing`)).status,
      404,
    );
    assert.equal(
      (await get(`${api}/form-definitions/showcase-error`)).status,
      503,
    );
    assert.equal((await (await get(`${api}/geocode?q=demo`)).json()).length, 2);
    assert.deepEqual(await (await get(`${api}/geocode?q=nothing`)).json(), []);
    assert.equal((await get(`${api}/geocode?q=offline`)).status, 503);
    for (const name of ["demo.png", "upload-fails.png"]) {
      const { data } = await (
        await post(`${api}/files/presign-upload`, {
          fileName: name,
          contentType: "image/png",
          size: png.length,
        })
      ).json();
      assert.equal(
        (await post(`${api}/files/confirm-upload`, { key: data.key })).status,
        400,
      );
      const result = await fetch(new URL(data.uploadUrl, origin), {
        method: "PUT",
        body: png,
      });
      assert.equal(result.status, name === "demo.png" ? 200 : 503);
      assert.equal(
        (await post(`${api}/files/confirm-upload`, { key: data.key })).status,
        name === "demo.png" ? 200 : 400,
      );
    }
    for (const outcome of [
      "success",
      "processing",
      "failure",
      "payment-pending",
      "payment-unavailable",
      "validation-error",
    ]) {
      const result = await post(`${api}/submissions`, {
        formId: "showcase",
        values: { declaration: { "submission-outcome": outcome } },
      });
      assert.equal(result.status, outcome === "validation-error" ? 422 : 200);
      const body = await result.json();
      if (outcome === "payment-pending")
        assert.equal(body.meta.deferred.paymentUrl, paymentUrl);
      if (outcome === "failure") assert.equal(body.data.status, "failed");
    }
    console.log("Demo API checks passed.");
  } finally {
    await server.close();
  }
}
