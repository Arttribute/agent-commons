"use client";

import { useState } from "react";

type ScrollableListFrameProps = {
  title: string;
  count: number;
  children: React.ReactNode;
  rowHeight?: number;
  defaultPageSize?: number;
};

const pageSizes = [5, 10, 20, 50];

export function ScrollableListFrame({
  title,
  count,
  children,
  rowHeight = 72,
  defaultPageSize = 10,
}: ScrollableListFrameProps) {
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const height = Math.max(220, Math.min(640, rowHeight * pageSize));

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{count} total</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          Rows
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className="overflow-auto rounded-lg border border-slate-200 bg-white"
        style={{ maxHeight: height }}
      >
        {children}
      </div>
    </section>
  );
}
