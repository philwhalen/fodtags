/** Pure SVG path `d` for an inline rating sparkline (Spec 05 §5.5). */
export function sparklinePath(series: number[], w: number, h: number): string {
  if (series.length < 2) {
    return "";
  }

  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min;

  const points = series.map((value, index) => {
    const x = (index / (series.length - 1)) * w;
    const y = range === 0 ? h / 2 : h - ((value - min) / range) * h;
    return `${x},${y}`;
  });

  return `M ${points.join(" L ")}`;
}

/** Text alternative for the sparkline (`aria-label`). */
export function sparklineSummary(series: number[]): string {
  if (series.length === 0) {
    return "No rated rounds";
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  if (series.length === 1) {
    return `1 round, ${min}`;
  }
  return `${series.length} rounds, ${min} to ${max}`;
}
