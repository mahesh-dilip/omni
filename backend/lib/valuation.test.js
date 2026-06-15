const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  stripCodeFences,
  parseGeminiJson,
  storagePathFromUrl,
  buildAttributesString,
  validateValueRequest,
  validateEditRequest,
} = require("./valuation");

// --- stripCodeFences ---

test("stripCodeFences removes ```json fence and trims", () => {
  const raw = "```json\n{\"a\":1}\n```";
  assert.equal(stripCodeFences(raw), '{"a":1}');
});

test("stripCodeFences removes bare ``` fences", () => {
  const raw = "```\n{\"a\":1}\n```";
  assert.equal(stripCodeFences(raw), '{"a":1}');
});

test("stripCodeFences leaves already-clean JSON untouched", () => {
  assert.equal(stripCodeFences('{"a":1}'), '{"a":1}');
});

test("stripCodeFences strips multiple fence occurrences (global)", () => {
  // Both the opening ```json and a stray ``` inside should be removed.
  const raw = "```json {\"a\":1} ``` ```";
  assert.equal(stripCodeFences(raw), '{"a":1}');
});

test("stripCodeFences throws on non-string input", () => {
  assert.throws(() => stripCodeFences(null), TypeError);
  assert.throws(() => stripCodeFences(42), TypeError);
});

// --- parseGeminiJson ---

test("parseGeminiJson parses a fenced valuation response", () => {
  const raw =
    '```json\n{"is_trackable": true, "estimated_value": 1200, "currency": "USD", "reasoning": "x"}\n```';
  assert.deepEqual(parseGeminiJson(raw), {
    is_trackable: true,
    estimated_value: 1200,
    currency: "USD",
    reasoning: "x",
  });
});

test("parseGeminiJson throws SyntaxError on invalid JSON", () => {
  assert.throws(() => parseGeminiJson("```json\nnot json\n```"), SyntaxError);
});

// --- storagePathFromUrl ---

test("storagePathFromUrl decodes a real Firebase download URL", () => {
  const url =
    "https://firebasestorage.googleapis.com/v0/b/my-bucket.appspot.com/o/images%2Fuid123%2F1700000000000_cat.png?alt=media&token=abc-def";
  assert.equal(storagePathFromUrl(url), "images/uid123/1700000000000_cat.png");
});

test("storagePathFromUrl handles a path with no query string", () => {
  const url = "https://x/o/images%2Ffoo.png";
  assert.equal(storagePathFromUrl(url), "images/foo.png");
});

test("storagePathFromUrl returns null when there is no /o/ segment", () => {
  assert.equal(storagePathFromUrl("https://example.com/no-object-here.png"), null);
});

test("storagePathFromUrl returns null for non-string input", () => {
  assert.equal(storagePathFromUrl(undefined), null);
  assert.equal(storagePathFromUrl(null), null);
});

// --- buildAttributesString ---

test("buildAttributesString capitalizes keys and joins with newlines", () => {
  const out = buildAttributesString({ condition: "Good", year: "2020" });
  assert.equal(out, "- Condition: Good\n- Year: 2020");
});

test("buildAttributesString returns empty string for null/undefined", () => {
  assert.equal(buildAttributesString(null), "");
  assert.equal(buildAttributesString(undefined), "");
});

test("buildAttributesString returns empty string for empty object", () => {
  assert.equal(buildAttributesString({}), "");
});

test("buildAttributesString preserves already-capitalized keys", () => {
  assert.equal(buildAttributesString({ RAM: "16" }), "- RAM: 16");
});

// --- validateValueRequest ---

test("validateValueRequest accepts itemId + name", () => {
  assert.deepEqual(validateValueRequest({ itemId: "i1", name: "Camera" }), {
    valid: true,
  });
});

test("validateValueRequest rejects missing name", () => {
  const r = validateValueRequest({ itemId: "i1" });
  assert.equal(r.valid, false);
  assert.equal(r.error, "Missing required item details.");
});

test("validateValueRequest rejects missing itemId", () => {
  assert.equal(validateValueRequest({ name: "Camera" }).valid, false);
});

test("validateValueRequest rejects empty/undefined body", () => {
  assert.equal(validateValueRequest(undefined).valid, false);
  assert.equal(validateValueRequest({}).valid, false);
});

// --- validateEditRequest ---

test("validateEditRequest accepts name + category", () => {
  assert.deepEqual(
    validateEditRequest({ name: "Camera", category: "Electronics" }),
    { valid: true }
  );
});

test("validateEditRequest rejects missing category", () => {
  const r = validateEditRequest({ name: "Camera" });
  assert.equal(r.valid, false);
  assert.equal(r.error, "Item name and category are required.");
});

test("validateEditRequest rejects missing name", () => {
  assert.equal(validateEditRequest({ category: "Electronics" }).valid, false);
});
