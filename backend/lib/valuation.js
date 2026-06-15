// Pure, side-effect-free helpers extracted from server.js so the branchy
// parsing / formatting logic can be unit-tested without Firebase or Gemini.
//
// Each function below mirrors logic that previously lived inline inside the
// Express route handlers (see server.js). Keeping it here means the route
// handlers stay thin and the tricky bits are independently verifiable.

/**
 * Strip the Markdown code-fence wrapper Gemini tends to add around JSON and
 * return the bare JSON string. Gemini responses look like:
 *   ```json
 *   { ... }
 *   ```
 * This mirrors the `.replace(...).replace(...).trim()` chain repeated in
 * /api/extract-details, /api/value, /api/get-attributes and re-evaluate.
 *
 * @param {string} responseText raw text from the model
 * @returns {string} the de-fenced, trimmed text
 */
function stripCodeFences(responseText) {
  if (typeof responseText !== "string") {
    throw new TypeError("responseText must be a string");
  }
  return responseText.replace(/```json/g, "").replace(/```/g, "").trim();
}

/**
 * De-fence and JSON.parse a Gemini response in one step.
 *
 * @param {string} responseText raw text from the model
 * @returns {any} parsed JSON value
 * @throws {SyntaxError} if the de-fenced text is not valid JSON
 */
function parseGeminiJson(responseText) {
  return JSON.parse(stripCodeFences(responseText));
}

/**
 * Extract the Firebase Storage object path from a download URL. Mirrors the
 * `decodeURIComponent(imageUrl.split("/o/")[1].split("?")[0])` logic in the
 * DELETE /api/items/:itemId handler.
 *
 * @param {string} imageUrl a Firebase Storage download URL
 * @returns {string|null} the decoded storage path, or null if the URL has no
 *   `/o/` segment (e.g. a non-Firebase URL)
 */
function storagePathFromUrl(imageUrl) {
  if (typeof imageUrl !== "string") return null;
  const afterO = imageUrl.split("/o/")[1];
  if (afterO === undefined) return null;
  return decodeURIComponent(afterO.split("?")[0]);
}

/**
 * Build the human-readable attributes block for the re-valuation prompt.
 * Mirrors the Object.entries(...).map(...).join('\n') logic inside
 * performRevaluation(). Each line is "- Key: value" with the key's first
 * letter upper-cased. Returns '' when there are no attributes.
 *
 * @param {Record<string, unknown>|null|undefined} attributes
 * @returns {string}
 */
function buildAttributesString(attributes) {
  if (!attributes) return "";
  return Object.entries(attributes)
    .map(([key, value]) => `- ${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
    .join("\n");
}

/**
 * Validate the body of POST /api/value. The handler requires both itemId and
 * name. Returns { valid: true } or { valid: false, error } so the route can
 * respond with a 400 + message.
 *
 * @param {{itemId?: unknown, name?: unknown}} body
 */
function validateValueRequest(body) {
  const b = body || {};
  if (!b.itemId || !b.name) {
    return { valid: false, error: "Missing required item details." };
  }
  return { valid: true };
}

/**
 * Validate the body of PUT /api/items/:itemId. The handler requires both name
 * and category.
 *
 * @param {{name?: unknown, category?: unknown}} body
 */
function validateEditRequest(body) {
  const b = body || {};
  if (!b.name || !b.category) {
    return { valid: false, error: "Item name and category are required." };
  }
  return { valid: true };
}

module.exports = {
  stripCodeFences,
  parseGeminiJson,
  storagePathFromUrl,
  buildAttributesString,
  validateValueRequest,
  validateEditRequest,
};
