# Range Max Source: First/Second Measure as Goal

**Date:** 2026-05-04
**Status:** Approved (design)
**Component:** Looker Radial Gauge marketplace viz

## Problem

The radial gauge currently determines its right-arm value (range max) one of two ways:

1. **Manual override** via the `Range Max Override` config field (`range_max`).
2. **Auto-compute** when `range_max` is empty: `Math.ceil(max(value, target))` rounded to the next decade.

Users want a third option: drive `range_max` from a measure in the query result. Specifically, set the second measure (or row 2 of the first measure) as the gauge's *goal* — the end of the arc — so the gauge fill represents progress toward goal as a proportion.

The existing `target_source` config can already point at the second measure, but it only renders that value as a dashed marker on the arc. It does not change `range_max`.

## Goals

- New config option `range_max_source` lets the user pick where `range_max` comes from: manual/auto, first measure (row 2), or second measure.
- Independent of `target_source` — both can be set freely.
- Mirrors the value set and edge-case behavior of `target_source` so users have one mental model.

## Non-goals

- Changing `range_min` behavior.
- Changing the 1 dimension / 2 measures input cap.
- Changing how the existing target marker (needle) is rendered.
- Adding a new "goal" label distinct from the existing range-max end-of-arc label.

## Design

### Config surface (`src/viz_gauge.js` `options`)

Add one new option, ordered just above `range_max`:

```js
range_max_source: {
  type: 'string',
  label: 'Range Max Source',
  display: 'select',
  section: 'Plot',
  values: [
    {'Manual / Auto': 'manual'},
    {'First Measure (Row 2)': 'first'},
    {'Second Measure': 'second'},
  ],
  default: 'manual',
  order: 29,
}
```

The existing `range_min` and `range_max` config fields are unchanged. When `range_max_source = 'manual'` (default), behavior is identical to today.

### Data flow

Resolve the goal value during chunk construction in both `processData` and `processPivot` (and the trellis path). Add the resolved goal to the chunk:

```js
// inside processData / processPivot, after target resolution
let goalValue = null;
if (config.range_max_source === 'second' && meas.length >= 2) {
  goalValue = data[0][meas[1]['name']].value;
} else if (
  config.range_max_source === 'first' &&
  config.viz_trellis_by !== 'row' &&
  data.length >= 2
) {
  goalValue = data[1][mesID].value;
}
chunk.goal = goalValue;   // null = no goal override
```

In `updateAsync`, replace the single `config.range_max = default_max` write with a per-chunk helper. Do not mutate `config.range_max` (current trellis code already has a quirk where shared `config.range_max` reflects only the last chunk; per-chunk resolution fixes it).

```js
function resolveRangeMax(chunk, config) {
  if (chunk.goal != null && chunk.goal > 0) return chunk.goal;
  if (config.range_max && config.range_max !== DEFAULT_MAX_RANGE) {
    return config.range_max;
  }
  // existing auto-compute (Math.ceil + decade rounding) using chunk.value/chunk.target
  const num = Math.max(
    Math.ceil(chunk.value),
    chunk.target ? Math.ceil(chunk.target) : 0
  );
  const len = (num + '').length;
  const fac = Math.pow(10, len - 1);
  return Math.ceil(num / fac) * fac;
}
```

Both `radialProps` builders (non-trellis branch and trellis loop) compute their own `effective_range_max = resolveRangeMax(chunk, config)` and pass `range: [config.range_min, effective_range_max]`. Each subgauge in trellis mode therefore renders with its own goal-derived range.

### Rendering

No changes required in `src/radial_gauge.js`. The right-arm end-of-arc label already renders `range[1]` formatted with `range_formatting`, so the goal value naturally appears as the max label. The existing value clamp (`value > range_max ? range_max : value`) and target clamp behave correctly when `range_max` is goal-derived.

### Edge cases (all silent fallbacks)

| Condition | Behavior |
|-----------|----------|
| `range_max_source = 'second'` but `meas.length < 2` | Fall back to manual/auto. No error. |
| `range_max_source = 'first'` but `data.length < 2` | Fall back to manual/auto. No error. |
| `range_max_source = 'first'` AND `viz_trellis_by = 'row'` | Fall back to manual/auto. No error. (Rows are trellis units; no row-2-as-goal semantics.) |
| Resolved goal is `null`, `0`, or negative | Fall back to manual/auto. (Gauge with goal ≤ 0 is degenerate.) |
| `target_source = 'second'` AND `range_max_source = 'second'` | Allowed. Same column drives both. Target needle lands at gauge end — visual "goal hit" marker. |
| Trellis-by-pivot + `range_max_source = 'second'` | Per-pivot second-measure value becomes that subgauge's goal. |
| 2-measure input cap | Unchanged. |

## Testing

- **Unit:** Extract goal resolution into a pure helper `resolveGoal(config, data, meas, mesID)` so it can be unit-tested without DOM/Looker stubs. Add `src/viz_gauge.test.js` (file does not exist today) covering: each source value, each fallback condition, trellis combinations, goal ≤ 0, missing measure.
- **Manual:** Use `bin/` dev harness with mock data covering the 4 × 3 = 12 source × target combos (or representative subset). Verify gauge fill ratio, max label, target marker placement.
- **Build:** `yarn build`, smoke-load resulting `dist/bundle.js` in a Looker dev instance.

## Implementation files

- `src/viz_gauge.js` — add `range_max_source` option; extract `resolveGoal` helper; thread `chunk.goal` through `processData`, `processPivot`, and both `updateAsync` branches (trellis and non-trellis).
- `src/viz_gauge.test.js` — new file, unit tests for `resolveGoal`.
- `CHANGELOG.md` — entry under next release.
- `README.md` — document new config option.

## Conventional commit

`feat: Add range max source option to use first or second measure as gauge goal`
