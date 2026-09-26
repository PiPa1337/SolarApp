import { expect, it } from "vitest";
import { parseJsonBytesChunked, stringifyJsonToBytes } from "./json-stream.mjs";

it("serializa y parsea un proyecto que supera el límite de cadena de V8", () => {
  const payload = "A".repeat(1_000_000);
  const source = `data:image/png;base64,${payload}`;
  const assets = Array.from({ length: 135 }, (_, index) => ({
    kind: "image",
    id: `asset-oversize-${index}`,
    source,
    fallbackSource: source,
    responsiveSources: [
      { width: 480, source },
      { width: 1800, source },
    ],
  }));
  const envelope = { format: "solara-project", version: 2, projectId: "store-x", assets };

  const bytes = stringifyJsonToBytes(envelope);
  expect(bytes.byteLength).toBeGreaterThan(536_870_888);

  const parsed = parseJsonBytesChunked(bytes) as typeof envelope;
  expect(parsed.projectId).toBe("store-x");
  expect(parsed.assets).toHaveLength(135);
  expect(parsed.assets[134]?.source).toBe(source);
}, 600_000);
