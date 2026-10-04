// Table footer used under the admin tables: "1 to 10 of 26", Previous,
// page / pages, Next. Renders nothing when the table is empty.
import { useLayoutEffect, useRef, useState } from 'react';

export const PAGE_SIZE = 10;

const btn = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

export default function Pager({ page, pages, total, onPage, pageSize = PAGE_SIZE }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
      <span>{from} to {to} of {total}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="px-2 tabular-nums">{page} / {pages}</span>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

/** Clamp `page` to the list and return the rows for it. */
export function paginate(list, page, pageSize = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  return { pages, page: safePage, rows: list.slice((safePage - 1) * pageSize, safePage * pageSize) };
}

/**
 * Minimum height for a paginated table's area: the header plus a full page
 * of rows. Reserving it keeps the pager (and everything below the table) in
 * the same place whether a page holds 1 row or PAGE_SIZE rows.
 */
export function tableMinHeight(rowHeight, headerHeight = 48, pageSize = PAGE_SIZE) {
  return headerHeight + rowHeight * pageSize;
}

/**
 * Measured version of tableMinHeight: attach the returned ref to the element
 * that wraps a paginated table. After each render it measures the header and
 * the tallest body row and reserves header + pageSize × row height (never
 * shrinking), so a page of 9 rows is exactly as tall as a page of 10 and the
 * pager below never moves.
 */
export function useTableReserve(fallbackRowHeight, pageSize = PAGE_SIZE) {
  const ref = useRef(null);
  const [reserve, setReserve] = useState(() => tableMinHeight(fallbackRowHeight, 48, pageSize));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const head = el.querySelector('thead');
    const rows = [...el.querySelectorAll('tbody > tr')].filter(r => !r.querySelector('td[colspan]'));
    if (!head || !rows.length) return;
    const rowH = Math.max(...rows.map(r => r.getBoundingClientRect().height));
    const next = Math.ceil(head.getBoundingClientRect().height + rowH * pageSize);
    if (next > reserve) setReserve(next);
  });
  return [ref, reserve];
}
