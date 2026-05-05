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
