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
