import { useMemo, useState } from 'react';
import type { Row } from '../api';

interface Props {
  columns: string[];
  rows: Row[];
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  if (Array.isArray(value)) return value.map(formatCell).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function compare(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return 1; // empty values last
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return formatCell(a).localeCompare(formatCell(b), undefined, { numeric: true });
}

export default function ResultsTable({ columns, rows }: Props) {
  const [sort, setSort] = useState<{ column: string; asc: boolean } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const factor = sort.asc ? 1 : -1;
    return [...rows].sort((r1, r2) => factor * compare(r1[sort.column], r2[sort.column]));
  }, [rows, sort]);

  const toggleSort = (column: string) =>
    setSort((s) => (s?.column === column ? { column, asc: !s.asc } : { column, asc: true }));

  if (rows.length === 0) {
    return <div className="empty small">The query ran but returned no rows.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} aria-sort={sort?.column === c ? (sort.asc ? 'ascending' : 'descending') : 'none'}>
                <button onClick={() => toggleSort(c)}>
                  {c}
                  <span className="sort-mark">{sort?.column === c ? (sort.asc ? '▲' : '▼') : ''}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} className={typeof row[c] === 'number' ? 'num' : ''}>
                  {formatCell(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
