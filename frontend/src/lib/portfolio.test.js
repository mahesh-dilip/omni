import {
  isCountable,
  aggregateByCategory,
  computePortfolioStats,
  formatDisplayValue,
  mapValuationRecord,
} from './portfolio';

// Realistic inventory fixtures mirroring the Firestore item shape.
const electronicsHigh = { name: 'MacBook', category: 'Electronics', is_trackable: true, status: 'analyzed', estimated_value: 1200 };
const electronicsLow = { name: 'Mouse', category: 'Electronics', is_trackable: true, status: 'analyzed', estimated_value: 25 };
const tool = { name: 'Drill', category: 'Tools & Hardware', is_trackable: true, status: 'analyzed', estimated_value: 90 };
const untracked = { name: 'Old Sock', category: 'Clothing & Accessories', is_trackable: false, status: 'analyzed', estimated_value: 0 };
const stillProcessing = { name: 'Camera', category: 'Electronics', is_trackable: true, status: 'processing_valuation', estimated_value: 500 };

describe('isCountable', () => {
  test('true only for trackable + analyzed', () => {
    expect(isCountable(electronicsHigh)).toBe(true);
  });
  test('false when not trackable', () => {
    expect(isCountable(untracked)).toBe(false);
  });
  test('false when status is not analyzed', () => {
    expect(isCountable(stillProcessing)).toBe(false);
  });
  test('false for null/undefined', () => {
    expect(isCountable(null)).toBe(false);
    expect(isCountable(undefined)).toBe(false);
  });
});

describe('aggregateByCategory', () => {
  test('returns [] for empty or missing data', () => {
    expect(aggregateByCategory([])).toEqual([]);
    expect(aggregateByCategory(null)).toEqual([]);
  });

  test('sums values within a category and excludes uncountable items', () => {
    const result = aggregateByCategory([
      electronicsHigh,
      electronicsLow,
      tool,
      untracked,        // excluded: not trackable
      stillProcessing,  // excluded: not analyzed
    ]);
    // Insertion order follows first appearance of each category.
    expect(result).toEqual([
      { name: 'Electronics', value: 1225 },
      { name: 'Tools & Hardware', value: 90 },
    ]);
  });

  test('falls back to "Other" when category is missing', () => {
    const result = aggregateByCategory([
      { is_trackable: true, status: 'analyzed', estimated_value: 10 },
    ]);
    expect(result).toEqual([{ name: 'Other', value: 10 }]);
  });

  test('treats missing estimated_value as 0', () => {
    const result = aggregateByCategory([
      { category: 'Books & Media', is_trackable: true, status: 'analyzed' },
    ]);
    expect(result).toEqual([{ name: 'Books & Media', value: 0 }]);
  });
});

describe('computePortfolioStats', () => {
  test('empty inventory returns the zero-state shape', () => {
    expect(computePortfolioStats([])).toEqual({
      totalValue: '0.00',
      trackedItems: 0,
      mostValuable: 'N/A',
    });
    expect(computePortfolioStats(null)).toEqual({
      totalValue: '0.00',
      trackedItems: 0,
      mostValuable: 'N/A',
    });
  });

  test('totals, counts and identifies the most valuable tracked item', () => {
    const stats = computePortfolioStats([electronicsHigh, electronicsLow, tool, untracked, stillProcessing]);
    expect(stats.totalValue).toBe('1315.00'); // 1200 + 25 + 90
    expect(stats.trackedItems).toBe(3);
    expect(stats.mostValuable).toBe('MacBook ($1200.00)');
  });

  test('returns N/A for most valuable when nothing is countable', () => {
    const stats = computePortfolioStats([untracked, stillProcessing]);
    expect(stats.totalValue).toBe('0.00');
    expect(stats.trackedItems).toBe(0);
    expect(stats.mostValuable).toBe('N/A');
  });

  test('keeps the first item on a value tie (strict > comparison)', () => {
    const a = { name: 'First', category: 'X', is_trackable: true, status: 'analyzed', estimated_value: 100 };
    const b = { name: 'Second', category: 'X', is_trackable: true, status: 'analyzed', estimated_value: 100 };
    expect(computePortfolioStats([a, b]).mostValuable).toBe('First ($100.00)');
  });
});

describe('formatDisplayValue', () => {
  test('formats trackable numeric value as $X.XX', () => {
    expect(formatDisplayValue(electronicsHigh)).toBe('$1200.00');
  });
  test('returns -- for untracked items', () => {
    expect(formatDisplayValue(untracked)).toBe('--');
  });
  test('returns -- when estimated_value is not a number', () => {
    expect(formatDisplayValue({ is_trackable: true, estimated_value: undefined })).toBe('--');
  });
  test('returns -- for null item', () => {
    expect(formatDisplayValue(null)).toBe('--');
  });
});

describe('mapValuationRecord', () => {
  test('converts a Firestore Timestamp to a locale date string', () => {
    const ts = { seconds: 1700000000 }; // a fixed instant
    const expectedDate = new Date(1700000000 * 1000).toLocaleDateString();
    expect(mapValuationRecord({ date: ts, value: 500, reasoning: 'why' })).toEqual({
      date: expectedDate,
      value: 500,
      reasoning: 'why',
    });
  });

  test('uses "N/A" when date is missing', () => {
    expect(mapValuationRecord({ value: 42 })).toEqual({
      date: 'N/A',
      value: 42,
      reasoning: undefined,
    });
  });

  test('handles an entirely empty doc', () => {
    expect(mapValuationRecord(undefined)).toEqual({
      date: 'N/A',
      value: undefined,
      reasoning: undefined,
    });
  });
});
