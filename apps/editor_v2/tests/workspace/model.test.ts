import { expect, test } from "vitest";
import {
  documentLabel,
  locationHash,
  readLocation,
  type PageDocument,
} from "../../src/workspace/model";

const page = (title: string, role: PageDocument["role"] = "supporting"): PageDocument => ({
  id: title,
  kind: "page",
  title,
  role,
});

test("API page labels distinguish roles without editing their titles", () => {
  expect(documentLabel(page("Service", "entry"))).toBe("Entry page");
  expect(documentLabel(page("Start", "start"))).toBe("Start page");
  expect(documentLabel(page("Supporting information"))).toBe("Supporting information");
  expect(documentLabel(page(""))).toBe("Untitled page");
});

test("navigation hashes round trip encoded identities and ignore malformed locations", () => {
  const location = { serviceId: "service/with spaces", documentId: "document #é" };
  expect(readLocation(locationHash(location))).toEqual(location);
  expect(readLocation(locationHash(undefined))).toBeUndefined();
  expect(readLocation("#/services/%E0%A4%A")).toBeUndefined();
  expect(readLocation("#/services/a/b/extra")).toBeUndefined();
  expect(readLocation("#/other/a")).toBeUndefined();
});
