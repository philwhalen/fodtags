import { sparklinePath, sparklineSummary } from "@/lib";

export function Sparkline({
  series,
  width = 80,
  height = 24,
  label,
}: {
  series: number[];
  width?: number;
  height?: number;
  label?: string;
}) {
  if (series.length < 2) {
    return null;
  }

  const ariaLabel = label ?? sparklineSummary(series);

  return (
    <span className="sparkline">
      <svg
        role="img"
        aria-label={ariaLabel}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="sparkline-svg"
      >
        <path d={sparklinePath(series, width, height)} className="sparkline-path" />
      </svg>
      <span className="sr-only">
        {series.map((value, index) => (
          <span key={index}>
            {index > 0 ? ", " : ""}
            {value}
          </span>
        ))}
      </span>
    </span>
  );
}
