import { readStat, type StatSource } from "../league/readStat";
import type { StatColumn } from "../league/types";

export function MiniStatGrid({ columns, source }: { columns: StatColumn[]; source: StatSource }) {
  return (
    <div className="mini-grid" style={{ ["--mini-cols" as string]: columns.length }}>
      {columns.map((column) => (
        <div className="mini-stat" key={column.key}>
          <span>{column.short}</span>
          <strong>{readStat(source, column.key)}</strong>
        </div>
      ))}
    </div>
  );
}

export function KpiRow({
  columns,
  source,
  compact
}: {
  columns: StatColumn[];
  source: StatSource;
  compact?: boolean;
}) {
  return (
    <div className={`hero-kpis${compact ? " compact" : ""}`}>
      {columns.map((column) => (
        <div key={column.key}>
          <span>{column.label}</span>
          <strong>{readStat(source, column.key)}</strong>
        </div>
      ))}
    </div>
  );
}
