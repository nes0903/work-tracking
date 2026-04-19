"use client";

import {
  PER_PAGE_OPTIONS,
  type PerPageOption,
} from "@/lib/tasks-api";

interface Props {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: PerPageOption) => void;
  disabled?: boolean;
}

export function Pagination({
  page,
  perPage,
  total,
  totalPages,
  onPageChange,
  onPerPageChange,
  disabled,
}: Props) {
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const pageNumbers = computePageNumbers(page, totalPages);

  return (
    <div className="pagination">
      <div className="pagination-info">
        총 {total.toLocaleString()}개
      </div>
      <div className="pagination-buttons">
        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || !hasPrev}
        >
          ◀
        </button>
        {pageNumbers.map((n, idx) =>
          n === "…" ? (
            <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={`pagination-btn ${n === page ? "active" : ""}`.trim()}
              onClick={() => onPageChange(n)}
              disabled={disabled}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || !hasNext}
        >
          ▶
        </button>
      </div>
      <select
        className="pagination-per-page"
        value={perPage}
        disabled={disabled}
        onChange={(event) => {
          const n = Number(event.target.value) as PerPageOption;
          onPerPageChange(n);
        }}
      >
        {PER_PAGE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}개씩
          </option>
        ))}
      </select>
    </div>
  );
}

function computePageNumbers(page: number, totalPages: number): Array<number | "…"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const window = 2;
  const start = Math.max(2, page - window);
  const end = Math.min(totalPages - 1, page + window);
  const result: Array<number | "…"> = [1];
  if (start > 2) result.push("…");
  for (let i = start; i <= end; i++) result.push(i);
  if (end < totalPages - 1) result.push("…");
  result.push(totalPages);
  return result;
}
