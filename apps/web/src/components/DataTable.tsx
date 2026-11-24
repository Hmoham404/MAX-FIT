import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Search } from 'lucide-react';
import { Button, Empty, ErrorBox, Input, Skeleton, useUI } from './ui';
import { cx, money } from '@/lib/format';
import { exportExcel, tablePDF } from '@/lib/docs';

export interface Column<T = any> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  sortKey?: string;
  money?: boolean;
  className?: string;
  /** value used for exports (defaults to row[key]) */
  exportValue?: (row: T) => unknown;
  hideOnMobile?: boolean;
}

type T = any;
export function DataTable({
  columns, rows, total, page = 1, pageSize = 25, onPage, search, onSearch, sort, onSort, loading, error, onRetry, actions, toolbar, title, fetchAll, onRowClick, searchPlaceholder = 'Rechercher…',
}: {
  columns: Column<T>[]; rows: T[]; total?: number; page?: number; pageSize?: number; onPage?: (p: number) => void;
  search?: string; onSearch?: (s: string) => void; sort?: string; onSort?: (s: string) => void; loading?: boolean; error?: unknown; onRetry?: () => void;
  actions?: (row: T) => ReactNode; toolbar?: ReactNode; title?: string; fetchAll?: () => Promise<T[]>; onRowClick?: (row: T) => void; searchPlaceholder?: string;
}) {
  const { toast } = useUI();
  const [q, setQ] = useState(search ?? '');
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    if (!onSearch) return;
    const id = setTimeout(() => q !== (search ?? '') && onSearch(q), 300);
    return () => clearTimeout(id);
  }, [q]);
  const pages = Math.max(1, Math.ceil((total ?? rows.length) / pageSize));
  const doExport = async (kind: 'xlsx' | 'pdf') => {
    setExporting(true);
    try {
      const all = fetchAll ? await fetchAll() : rows;
      const cols = columns.filter((c) => c.key !== '_actions').map((c) => ({ key: c.key, label: c.label, money: c.money }));
      const data = all.map((r: any) => Object.fromEntries(columns.map((c) => [c.key, c.exportValue ? c.exportValue(r) : r[c.key]])));
      if (kind === 'xlsx') await exportExcel(title || 'export', cols, data);
      else await tablePDF(title || 'Export', cols, data);
      toast('success', `Export ${kind.toUpperCase()} généré (${all.length} lignes)`);
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-anthracite">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-3 dark:border-white/10">
        {onSearch && (
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 rtl:left-auto rtl:right-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="ps-9" />
          </div>
        )}
        <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div>
        {title && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" loading={exporting} onClick={() => doExport('xlsx')} title="Export Excel"><FileSpreadsheet className="h-4 w-4 text-emerald-600" />Excel</Button>
            <Button size="sm" variant="outline" disabled={exporting} onClick={() => doExport('pdf')} title="Export PDF"><FileText className="h-4 w-4 text-red-500" />PDF</Button>
          </div>
        )}
      </div>
      {error ? <div className="p-4"><ErrorBox error={error} onRetry={onRetry} /></div> : (
        <>
        {/* Mobile mode: rows as cards */}
        <div className="divide-y divide-zinc-100 md:hidden dark:divide-white/5">
          {loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="space-y-2 p-4"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-full" /></div>)}
          {!loading && rows.map((r, i) => {
            const [first, ...rest] = columns.filter((c) => c.key !== '_actions' && c.label);
            return (
              <div key={(r.id as any) ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx('p-4', onRowClick && 'active:bg-zinc-50 dark:active:bg-white/5')}>
                {first && <div className="mb-2 font-semibold">{first.render ? first.render(r) : first.money ? money((r as any)[first.key]) : String((r as any)[first.key] ?? '—')}</div>}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  {rest.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{c.label}</dt>
                      <dd className="truncate">{c.render ? c.render(r) : c.money ? money((r as any)[c.key]) : String((r as any)[c.key] ?? '—')}</dd>
                    </div>
                  ))}
                </dl>
                {actions && <div className="mt-3 flex flex-wrap justify-end gap-1 border-t border-zinc-100 pt-2 dark:border-white/5" onClick={(e) => e.stopPropagation()}>{actions(r)}</div>}
              </div>
            );
          })}
          {!loading && rows.length === 0 && <Empty />}
        </div>
        <div className="scrollbar-thin hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-start text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/[0.03]">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={cx('whitespace-nowrap px-4 py-3 text-start font-semibold', c.hideOnMobile && 'hidden md:table-cell', c.money && 'text-end')}>
                    {c.sortKey && onSort ? (
                      <button className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white" onClick={() => onSort(sort === `${c.sortKey}:asc` ? `${c.sortKey}:desc` : `${c.sortKey}:asc`)}>
                        {c.label}
                        {sort?.startsWith(c.sortKey + ':') && (sort.endsWith('asc') ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    ) : c.label}
                  </th>
                ))}
                {actions && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{columns.map((c) => <td key={c.key} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}{actions && <td />}</tr>
              ))}
              {!loading && rows.map((r, i) => (
                <tr key={(r.id as any) ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx('transition hover:bg-zinc-50 dark:hover:bg-white/[0.03]', onRowClick && 'cursor-pointer')}>
                  {columns.map((c) => (
                    <td key={c.key} className={cx('px-4 py-3 align-middle', c.hideOnMobile && 'hidden md:table-cell', c.money && 'whitespace-nowrap text-end tabular-nums', c.className)}>
                      {c.render ? c.render(r) : c.money ? money((r as any)[c.key]) : String((r as any)[c.key] ?? '—')}
                    </td>
                  ))}
                  {actions && <td className="px-2 py-2 text-end" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1">{actions(r)}</div></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && <Empty />}
        </div>
        </>
      )}
      {onPage && (total ?? 0) > pageSize && (
        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 text-sm dark:border-white/10">
          <span className="text-zinc-500">{total} résultats · page {page}/{pages}</span>
          <div className="flex gap-1">
            <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></Button>
            <Button size="icon" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
