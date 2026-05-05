# Range Max Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `range_max_source` config option that lets the gauge's right-arm value (range max) be driven by the first or second measure of the query result, treating that value as the gauge's goal.

**Architecture:** Extract two pure helpers (`resolveGoal`, `resolveRangeMax`) into a new `src/range.js` module so they can be unit-tested without Looker globals. Wire them into `viz_gauge.js` at the chunk-construction and radialProps-build seams. No changes to `radial_gauge.js` — the existing range-max label and clamping behavior are reused as-is.

**Tech Stack:** JavaScript (ES modules via Babel), Jest for unit tests, Webpack for build, D3 for rendering (untouched).

**Spec:** `docs/superpowers/specs/2026-05-04-second-measure-as-goal-design.md`

---

## File Structure

- **Create:** `src/range.js` — pure helpers `resolveGoal(config, data, meas, mesID)` and `resolveRangeMax(chunk, config)`. No Looker dependencies, no DOM.
- **Create:** `src/range.test.js` — Jest tests for both helpers.
- **Modify:** `src/viz_gauge.js` — add `range_max_source` option; import helpers; thread `chunk.goal` through `processData` and `processPivot`; replace inline auto-compute with `resolveRangeMax` per-chunk in both `updateAsync` branches.
- **Modify:** `CHANGELOG.md` — Unreleased entry.
- **Modify:** `README.md` — document the new option.

`viz_gauge.js` itself is not unit-testable in isolation today (it calls `looker.plugins.visualizations.add` at module load and assumes `LookerCharts` global). All testable logic lives in `range.js`. End-to-end verification is manual via the dev harness in `bin/`.

---

### Task 1: Create resolveGoal helper with failing tests

**Files:**
- Create: `src/range.js`
- Create: `src/range.test.js`

- [ ] **Step 1: Write failing tests for resolveGoal**

Create `src/range.test.js`:

```js
import {resolveGoal} from './range';

const meas1 = [{name: 'm1'}];
const meas2 = [{name: 'm1'}, {name: 'm2'}];

describe('resolveGoal', () => {
  test('returns null when source is manual', () => {
    expect(resolveGoal({range_max_source: 'manual'}, [{m1: {value: 5}}], meas1, 'm1')).toBeNull();
  });

  test('returns null when source is undefined', () => {
    expect(resolveGoal({}, [{m1: {value: 5}}], meas1, 'm1')).toBeNull();
  });

  test('returns second measure value when source is "second" and 2 measures present', () => {
    const data = [{m1: {value: 5}, m2: {value: 80}}];
    expect(resolveGoal({range_max_source: 'second'}, data, meas2, 'm1')).toBe(80);
  });

  test('returns null when source is "second" but only 1 measure present', () => {
    expect(resolveGoal({range_max_source: 'second'}, [{m1: {value: 5}}], meas1, 'm1')).toBeNull();
  });

  test('returns row 2 of first measure when source is "first" and 2 rows present', () => {
    const data = [{m1: {value: 5}}, {m1: {value: 90}}];
    expect(resolveGoal({range_max_source: 'first'}, data, meas1, 'm1')).toBe(90);
  });

  test('returns null when source is "first" but only 1 row present', () => {
    expect(resolveGoal({range_max_source: 'first'}, [{m1: {value: 5}}], meas1, 'm1')).toBeNull();
  });

  test('returns null when source is "first" and trellis is row', () => {
    const data = [{m1: {value: 5}}, {m1: {value: 90}}];
    const config = {range_max_source: 'first', viz_trellis_by: 'row'};
    expect(resolveGoal(config, data, meas1, 'm1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `yarn test src/range.test.js`
Expected: FAIL with `Cannot find module './range'`.

- [ ] **Step 3: Implement resolveGoal**

Create `src/range.js`:

```js
export function resolveGoal(config, data, meas, mesID) {
  if (config.range_max_source === 'second' && meas.length >= 2) {
    return data[0][meas[1].name].value;
  }
  if (
    config.range_max_source === 'first' &&
    config.viz_trellis_by !== 'row' &&
    data.length >= 2
  ) {
    return data[1][mesID].value;
  }
  return null;
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `yarn test src/range.test.js`
Expected: PASS, 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/range.js src/range.test.js
git commit -m "feat: Add resolveGoal helper for range max source"
```

---

### Task 2: Add resolveRangeMax helper with failing tests

**Files:**
- Modify: `src/range.js`
- Modify: `src/range.test.js`

- [ ] **Step 1: Add failing tests for resolveRangeMax**

Append to `src/range.test.js`:

```js
import {resolveRangeMax} from './range';

describe('resolveRangeMax', () => {
  test('returns goal when chunk.goal is positive', () => {
    const chunk = {goal: 80, value: 50, target: null};
    expect(resolveRangeMax(chunk, {range_max: null})).toBe(80);
  });

  test('goal wins over manual range_max', () => {
    const chunk = {goal: 120, value: 50, target: null};
    expect(resolveRangeMax(chunk, {range_max: 50})).toBe(120);
  });

  test('falls through to manual range_max when goal is null', () => {
    const chunk = {goal: null, value: 50, target: null};
    expect(resolveRangeMax(chunk, {range_max: 200})).toBe(200);
  });

  test('falls through to manual range_max when goal is zero', () => {
    const chunk = {goal: 0, value: 50, target: null};
    expect(resolveRangeMax(chunk, {range_max: 200})).toBe(200);
  });

  test('falls through to manual range_max when goal is negative', () => {
    const chunk = {goal: -10, value: 50, target: null};
    expect(resolveRangeMax(chunk, {range_max: 200})).toBe(200);
  });

  test('auto-computes from value when no goal and no range_max', () => {
    const chunk = {goal: null, value: 37, target: null};
    expect(resolveRangeMax(chunk, {range_max: null})).toBe(40);
  });

  test('auto-computes from max(value, target) when both present', () => {
    const chunk = {goal: null, value: 37, target: 85};
    expect(resolveRangeMax(chunk, {range_max: null})).toBe(90);
  });

  test('auto-compute rounds up to next decade', () => {
    expect(resolveRangeMax({goal: null, value: 123, target: null}, {range_max: null})).toBe(200);
    expect(resolveRangeMax({goal: null, value: 7, target: null}, {range_max: null})).toBe(7);
    expect(resolveRangeMax({goal: null, value: 1234, target: null}, {range_max: null})).toBe(2000);
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `yarn test src/range.test.js`
Expected: FAIL with `resolveRangeMax is not defined` or import error.

- [ ] **Step 3: Implement resolveRangeMax**

Append to `src/range.js`:

```js
export function resolveRangeMax(chunk, config) {
  if (chunk.goal != null && chunk.goal > 0) {
    return chunk.goal;
  }
  if (config.range_max) {
    return config.range_max;
  }
  const num = Math.max(
    Math.ceil(chunk.value),
    chunk.target ? Math.ceil(chunk.target) : 0
  );
  const len = (num + '').length;
  const fac = Math.pow(10, len - 1);
  return Math.ceil(num / fac) * fac;
}
```

Note: existing code in `viz_gauge.js` treats `range_max === DEFAULT_MAX_RANGE` (which is `null`) as "use auto-compute". Since `null` is falsy, the single check `if (config.range_max)` reproduces the same behavior.

- [ ] **Step 4: Run tests and verify they pass**

Run: `yarn test src/range.test.js`
Expected: PASS, 15 tests passing total (7 + 8).

- [ ] **Step 5: Commit**

```bash
git add src/range.js src/range.test.js
git commit -m "feat: Add resolveRangeMax helper that prefers goal over manual override"
```

---

### Task 3: Add range_max_source option to viz_gauge.js

**Files:**
- Modify: `src/viz_gauge.js` (insert into `options` object near line 417, just after `range_max`)

- [ ] **Step 1: Add the option**

In `src/viz_gauge.js`, find the `range_max` option block (around line 410-417):

```js
range_max: {
  type: 'number',
  label: 'Range Max Override',
  section: 'Plot',
  order: 31,
  default: DEFAULT_MAX_RANGE,
  display_size: 'half',
},
```

Insert immediately above it:

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
},
```

- [ ] **Step 2: Verify build still works**

Run: `yarn build`
Expected: webpack succeeds, `dist/bundle.js` written, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/viz_gauge.js
git commit -m "feat: Add range_max_source config option"
```

---

### Task 4: Thread chunk.goal through processData

**Files:**
- Modify: `src/viz_gauge.js`

- [ ] **Step 1: Import resolveGoal at the top of viz_gauge.js**

Find the existing imports (lines 1-5):

```js
import RadialGauge from './radial_gauge';
import React from 'react';
import ReactDOM from 'react-dom';
import SSF from 'ssf';
import {trimSpecialCharacters} from './string';
```

Add below them:

```js
import {resolveGoal, resolveRangeMax} from './range';
```

- [ ] **Step 2: Add chunk.goal to processData's returned chunk**

In `processData` (around lines 154-313), find the `let chunk = { ... };` block (around line 284). Add `goal` as a new field:

```js
let chunk = {
  value: mesData.value,
  value_links: mesData.links,
  value_label: ...,
  value_rendered: ...,
  value_dimension: ...,
  target: tarValue,
  target_rendered: tarRendered,
  target_label: ...,
  target_dimension: tarDim,
  goal: resolveGoal(config, data, meas, mesID),
};
```

(Keep all existing fields; only the `goal` line is new.)

- [ ] **Step 3: Verify build**

Run: `yarn build`
Expected: webpack succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/viz_gauge.js
git commit -m "feat: Resolve goal value in processData chunks"
```

---

### Task 5: Thread chunk.goal through processPivot

**Files:**
- Modify: `src/viz_gauge.js`

- [ ] **Step 1: Add goal to processPivot's returned chunk**

In `processPivot` (around lines 9-152), find the `let chunk = { ... };` block (around line 125). Add the same `goal` field:

```js
let chunk = {
  value: mesData.value,
  value_links: mesData.links,
  value_label: ...,
  value_rendered: ...,
  value_dimension: ...,
  target: tarValue,
  target_rendered: tarRendered,
  target_label: ...,
  target_dimension: tarDim,
  goal: resolveGoal(config, data, meas, mesID),
};
```

For pivot mode `data` is the full row array passed in, which is what `resolveGoal` expects. The pivot trellis-row guard inside `resolveGoal` is harmless here because pivot mode never sets `viz_trellis_by` to `'row'`.

- [ ] **Step 2: Verify build**

Run: `yarn build`
Expected: webpack succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/viz_gauge.js
git commit -m "feat: Resolve goal value in processPivot chunks"
```

---

### Task 6: Use resolveRangeMax in non-trellis branch

**Files:**
- Modify: `src/viz_gauge.js`

- [ ] **Step 1: Replace inline auto-compute with resolveRangeMax for the non-trellis path**

In `updateAsync`, find the existing auto-compute block (around lines 768-777):

```js
if (!config.range_max || config.range_max === DEFAULT_MAX_RANGE) {
  let num = Math.max(
    Math.ceil(chunk.value),
    chunk.target ? Math.ceil(chunk.target) : 0
  );
  var len = (num + '').length;
  var fac = Math.pow(10, len - 1);
  let default_max = Math.ceil(num / fac) * fac;
  config.range_max = default_max;
}
```

Delete that block entirely. (We will compute per-chunk in both branches instead.)

Then in the non-trellis branch (the `if (config.viz_trellis_by === 'none')` block, around lines 779-839), find the `range:` line in `viz.radialProps` (around line 792):

```js
range: [config.range_min, config.range_max],
```

Replace with:

```js
range: [config.range_min, resolveRangeMax(chunk, config)],
```

Also update the `value` and `target` clamps that reference `config.range_max` (lines 793 and 798) to use the resolved value. To avoid recomputing, hoist it:

Find:

```js
viz.radialProps = {
  cleanup: `gauge`,
  trellis_by: config.viz_trellis_by,
  w: width,
  h: height,
  ...
  range: [config.range_min, config.range_max],
  value: chunk.value > config.range_max ? config.range_max : chunk.value,
  ...
  target:
    chunk.target > config.range_max ? config.range_max : chunk.target,
```

Replace the start of the non-trellis branch so it reads:

```js
if (config.viz_trellis_by === 'none') {
  const effective_range_max = resolveRangeMax(chunk, config);
  viz.radialProps = {
    cleanup: `gauge`,
    trellis_by: config.viz_trellis_by,
    w: width,
    h: height,
    limiting_aspect: width < height ? 'vw' : 'vh',
    margin: margin,
    style: config.style,
    angle: config.angle,
    cutout: config.cutout,
    color: config.fill_color,
    gauge_background: config.background_color,
    range: [config.range_min, effective_range_max],
    value: chunk.value > effective_range_max ? effective_range_max : chunk.value,
    value_rendered: chunk.value_rendered,
    target:
      chunk.target > effective_range_max ? effective_range_max : chunk.target,
    // ... rest of radialProps unchanged
```

(Leave every property below `target:` exactly as it is today.)

- [ ] **Step 2: Verify build**

Run: `yarn build`
Expected: webpack succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/viz_gauge.js
git commit -m "feat: Use resolveRangeMax per-chunk in non-trellis branch"
```

---

### Task 7: Use resolveRangeMax in trellis branch

**Files:**
- Modify: `src/viz_gauge.js`

- [ ] **Step 1: Compute effective_range_max per chunk in the trellis loop**

In `updateAsync`, find the trellis `else` branch with `chunk_multiples.forEach(function (d, i) { ... })` (around lines 841-906).

At the top of the forEach callback, compute the per-chunk range max and use it in `range`, `value`, and `target`:

Replace:

```js
chunk_multiples.forEach(function (d, i) {
  let limit =
    config.viz_trellis_by === 'row'
      ? Math.min(config.trellis_cols * config.trellis_rows, data.length)
      : Math.min(
          config.trellis_cols * config.trellis_rows,
          queryResponse.pivots.length
        );
  viz.radialProps = {
    cleanup: `subgauge${i}`,
    trellis_by: config.viz_trellis_by,
    trellis_limit: limit,
    w: width / config.trellis_cols,
    h: height / config.trellis_rows,
    ...
    range: [config.range_min, config.range_max],
    value: d.value > config.range_max ? config.range_max : d.value,
    value_rendered: d.value_rendered,
    target: d.target > config.range_max ? config.range_max : d.target,
```

With:

```js
chunk_multiples.forEach(function (d, i) {
  let limit =
    config.viz_trellis_by === 'row'
      ? Math.min(config.trellis_cols * config.trellis_rows, data.length)
      : Math.min(
          config.trellis_cols * config.trellis_rows,
          queryResponse.pivots.length
        );
  const effective_range_max = resolveRangeMax(d, config);
  viz.radialProps = {
    cleanup: `subgauge${i}`,
    trellis_by: config.viz_trellis_by,
    trellis_limit: limit,
    w: width / config.trellis_cols,
    h: height / config.trellis_rows,
    limiting_aspect: width < height ? 'vw' : 'vh',
    margin: margin,
    style: config.style,
    angle: config.angle,
    cutout: config.cutout,
    color: config.fill_color,
    gauge_background: config.background_color,
    range: [config.range_min, effective_range_max],
    value: d.value > effective_range_max ? effective_range_max : d.value,
    value_rendered: d.value_rendered,
    target: d.target > effective_range_max ? effective_range_max : d.target,
    // ... rest of radialProps unchanged
```

(Every property below `target:` stays as-is.)

- [ ] **Step 2: Verify full test suite still green**

Run: `yarn test`
Expected: all existing tests + new range tests pass.

- [ ] **Step 3: Verify build produces a clean bundle**

Run: `yarn build`
Expected: webpack succeeds, `dist/bundle.js` regenerated, no eslint or babel errors.

- [ ] **Step 4: Commit**

```bash
git add src/viz_gauge.js
git commit -m "feat: Use resolveRangeMax per-chunk in trellis branch"
```

---

### Task 8: Manual smoke test in Looker dev harness

**Files:** none modified — verification only.

- [ ] **Step 1: Inspect dev harness**

Run: `ls bin/`
Expected: a script or HTML page that loads `dist/bundle.js`. (Repo has `bin/`; check what's there before assuming.)

- [ ] **Step 2: Build and load**

Run: `yarn build`
Then open the dev harness or upload `dist/bundle.js` to a Looker dev instance.

- [ ] **Step 3: Verify each source × target combo**

In a Looker dashboard with one dimension and two measures, verify each `range_max_source` value:

| range_max_source | Expected behavior |
|------------------|-------------------|
| `Manual / Auto` | Identical to today: range_max field used if set, else auto-compute. |
| `First Measure (Row 2)` | With ≥2 rows: row-2 of first measure becomes gauge end. With 1 row: silent fallback to manual/auto. With trellis-by-row: silent fallback. |
| `Second Measure` | With 2 measures: second measure value becomes gauge end. With 1 measure: silent fallback. |

For each combo also verify:
- Gauge fill ratio is `value / goal` when goal is set.
- Right-arm label shows the goal value (formatted via `range_formatting`).
- Existing target marker (`target_source`) renders independently.
- No console errors.

- [ ] **Step 4: No commit needed**

This task is verification only.

---

### Task 9: Update docs

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add CHANGELOG entry**

Open `CHANGELOG.md`. Below the top header, add an Unreleased section (or extend an existing one):

```markdown
## Unreleased

### Features

* Add `Range Max Source` config option. The gauge's range max can now be driven by the first measure (row 2) or the second measure of the query result, in addition to the existing manual override and auto-compute behaviors.
```

- [ ] **Step 2: Document the option in README.md**

In `README.md`, append a short "Configuration options" section if one does not exist, including:

```markdown
### Range Max Source

Controls where the gauge's right-arm value (range max) comes from.

- **Manual / Auto** (default) — uses the `Range Max Override` field if set, otherwise auto-computes from the value and target.
- **First Measure (Row 2)** — when the query returns at least two rows of one measure, row 2 becomes the gauge's goal. Falls back silently if only one row is returned or when the visualization is trellising by row.
- **Second Measure** — when the query has a second measure, its value becomes the gauge's goal. Falls back silently if a second measure is not provided.

This option is independent of `Target Source`. You can set both — for example, drive the goal from the second measure and the target marker from an override value.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: Document range_max_source option"
```

---

### Task 10: Open the pull request

**Files:** none.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin feat/range-max-source`

- [ ] **Step 2: Open PR**

Run:

```bash
gh pr create --title "feat: Add Range Max Source option (first/second measure as goal)" --body "$(cat <<'EOF'
## Summary
- New `Range Max Source` config option lets users drive the gauge's right-arm value from the first measure (row 2) or the second measure of the query, treating that value as the gauge's goal.
- Independent of `Target Source` — the existing target marker still works freely.
- Pure goal/range resolution extracted to `src/range.js` with unit tests.

## Test plan
- [x] `yarn test` — new helpers covered by 15 tests in `src/range.test.js`.
- [x] `yarn build` — clean webpack bundle.
- [ ] Manual smoke test in Looker dev harness covering all 3 source values and 1 / 2 measure / row combinations.

Spec: `docs/superpowers/specs/2026-05-04-second-measure-as-goal-design.md`
Plan: `docs/superpowers/plans/2026-05-05-range-max-source.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.
