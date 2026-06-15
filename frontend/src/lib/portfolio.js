// Pure, side-effect-free helpers for portfolio math and display formatting.
// Extracted from Dashboard.js, PortfolioChart.js and ItemDetailPage.js so the
// branchy aggregation logic can be unit-tested without rendering React or
// touching Firebase. The components import from here; this file imports nothing.

/**
 * An item is counted toward portfolio value only once it has been valued and
 * is flagged trackable. This single predicate is the source of truth used by
 * both the stats cards and the category pie chart.
 *
 * @param {{is_trackable?: boolean, status?: string}} item
 * @returns {boolean}
 */
export function isCountable(item) {
  return Boolean(item && item.is_trackable && item.status === "analyzed");
}

/**
 * Group countable items by category and sum their estimated values. Mirrors
 * the reduce() in PortfolioChart.js. Items with no category fall under
 * "Other"; missing values count as 0.
 *
 * @param {Array} data inventory items
 * @returns {Array<{name: string, value: number}>} one entry per category
 */
export function aggregateByCategory(data) {
  if (!data || data.length === 0) return [];

  const categoryValues = data.filter(isCountable).reduce((acc, item) => {
    const category = item.category || "Other";
    const value = item.estimated_value || 0;
    if (!acc[category]) acc[category] = 0;
    acc[category] += value;
    return acc;
  }, {});

  return Object.entries(categoryValues).map(([name, value]) => ({ name, value }));
}

/**
 * Compute the three headline portfolio stats. Mirrors the useMemo in
 * Dashboard.js exactly, including the empty-inventory shape and the
 * most-valuable tie-break (the reduce keeps the first item on a tie because it
 * uses a strict `>` comparison seeded with tracked[0]).
 *
 * @param {Array} inventory
 * @returns {{totalValue: string, trackedItems: number, mostValuable: string}}
 */
export function computePortfolioStats(inventory) {
  if (!inventory || inventory.length === 0) {
    return { totalValue: "0.00", trackedItems: 0, mostValuable: "N/A" };
  }

  const tracked = inventory.filter(isCountable);
  const totalValue = tracked.reduce(
    (sum, item) => sum + (item.estimated_value || 0),
    0
  );
  const mostValuable =
    tracked.length > 0
      ? tracked.reduce(
          (max, item) =>
            (item.estimated_value || 0) > (max.estimated_value || 0)
              ? item
              : max,
          tracked[0]
        )
      : null;

  return {
    totalValue: totalValue.toFixed(2),
    trackedItems: tracked.length,
    mostValuable: mostValuable
      ? `${mostValuable.name} ($${(mostValuable.estimated_value || 0).toFixed(2)})`
      : "N/A",
  };
}

/**
 * Format an item's current value for display. Mirrors the inline ternary used
 * in both InventoryItemCard (Dashboard) and ItemDetailPage: only trackable
 * items with a numeric value show "$X.XX"; everything else shows "--".
 *
 * @param {{is_trackable?: boolean, estimated_value?: unknown}} item
 * @returns {string}
 */
export function formatDisplayValue(item) {
  if (item && item.is_trackable && typeof item.estimated_value === "number") {
    return `$${item.estimated_value.toFixed(2)}`;
  }
  return "--";
}

/**
 * Map a raw Firestore valuation doc into the shape the Recharts LineChart
 * consumes. Mirrors the mapping in ItemDetailPage's history listener: a
 * Firestore Timestamp ({seconds}) becomes a locale date string, and a missing
 * date becomes "N/A".
 *
 * @param {{date?: {seconds: number}, value?: number, reasoning?: string}} doc
 * @returns {{date: string, value: number|undefined, reasoning: string|undefined}}
 */
export function mapValuationRecord(doc) {
  const d = doc || {};
  return {
    date: d.date ? new Date(d.date.seconds * 1000).toLocaleDateString() : "N/A",
    value: d.value,
    reasoning: d.reasoning,
  };
}
