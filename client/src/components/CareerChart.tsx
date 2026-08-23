import type { SeasonAppearance } from "../types";

type Props = {
  seasons: SeasonAppearance[];
  selectedSeason?: string;
};

export function CareerChart({ seasons, selectedSeason }: Props) {
  const chronological = [...seasons].sort((a, b) => Number(a.season) - Number(b.season));
  if (chronological.length < 2) return null;

  const width = 320;
  const height = 120;
  const padX = 28;
  const padY = 18;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const maxPts = Math.max(...chronological.map((row) => row.derived.totalPoints), 1);
  const maxTd = Math.max(...chronological.map((row) => row.derived.totalTouchdowns), 1);
  const step = chronological.length === 1 ? chartW : chartW / (chronological.length - 1);

  const ptsPoints = chronological.map((row, index) => {
    const x = padX + index * step;
    const y = padY + chartH - (row.derived.totalPoints / maxPts) * chartH;
    return { x, y, row };
  });

  const tdPoints = chronological.map((row, index) => {
    const x = padX + index * step;
    const y = padY + chartH - (row.derived.totalTouchdowns / maxTd) * chartH;
    return { x, y, row };
  });

  const line = (points: Array<{ x: number; y: number }>) =>
    points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  return (
    <div className="career-chart" aria-label="Career points and touchdowns by season">
      <div className="career-chart-legend">
        <span className="legend-pts">Points</span>
        <span className="legend-td">Touchdowns</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <line className="chart-axis" x1={padX} y1={padY + chartH} x2={padX + chartW} y2={padY + chartH} />
        <path className="chart-line pts" d={line(ptsPoints)} />
        <path className="chart-line td" d={line(tdPoints)} />
        {ptsPoints.map(({ x, y, row }) => (
          <circle
            key={`pts-${row.season}`}
            className={`chart-dot pts${row.season === selectedSeason ? " active" : ""}`}
            cx={x}
            cy={y}
            r={row.season === selectedSeason ? 4.5 : 3.5}
          />
        ))}
        {tdPoints.map(({ x, y, row }) => (
          <circle
            key={`td-${row.season}`}
            className={`chart-dot td${row.season === selectedSeason ? " active" : ""}`}
            cx={x}
            cy={y}
            r={row.season === selectedSeason ? 4 : 3}
          />
        ))}
        {chronological.map((row, index) => (
          <text
            key={`label-${row.season}`}
            className={`chart-label${row.season === selectedSeason ? " active" : ""}`}
            x={padX + index * step}
            y={height - 2}
            textAnchor="middle"
          >
            {row.season.slice(2)}
          </text>
        ))}
      </svg>
    </div>
  );
}
