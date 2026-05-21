"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  const pages = buildPageNumbers(safePage, totalPages);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border/50 bg-card/50">
      <p className="text-xs text-muted-foreground order-2 sm:order-1">
        Menampilkan{" "}
        <span className="font-semibold text-foreground">
          {start}–{end}
        </span>{" "}
        dari <span className="font-semibold text-foreground">{total}</span>
      </p>

      <div className="flex items-center gap-2 order-1 sm:order-2">
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Baris per halaman"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n} / halaman
              </option>
            ))}
          </select>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <div className="flex items-center gap-1">
          {pages.map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p as number)}
                className={`min-w-[2rem] h-8 px-2 rounded-lg text-xs font-semibold transition-colors ${
                  p === safePage
                    ? "bg-primary text-primary-foreground"
                    : "bg-background border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {p}
              </button>
            )
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function buildPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}
