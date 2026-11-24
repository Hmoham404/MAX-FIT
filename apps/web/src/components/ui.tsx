import { createContext, forwardRef, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Inbox, Info, Loader2, X, XCircle } from 'lucide-react';
import { cx } from '@/lib/format';

// ---------------- Button ----------------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-ink hover:brightness-95 shadow-[0_0_0_0_rgba(190,242,100,0.5)] hover:shadow-[0_0_24px_-4px_rgb(var(--brand)/0.7)]',
  secondary: 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-ink dark:hover:bg-zinc-200',
  ghost: 'hover:bg-zinc-100 dark:hover:bg-white/10',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  outline: 'border border-zinc-300 dark:border-white/15 hover:bg-zinc-50 dark:hover:bg-white/5',
};
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'icon'; loading?: boolean }>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...p }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        size === 'icon' && 'h-9 w-9',
        variants[variant],
        className,
      )}
      {...p}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
);

// ---------------- Inputs ----------------
const inputCls =
  'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30 dark:border-white/10 dark:bg-white/5 dark:text-white';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cx(inputCls, 'h-10', className)} {...p} />);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cx(inputCls, 'min-h-[80px]', className)} {...p} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cx(inputCls, 'h-10 pr-8 [&>option]:text-zinc-900', className)} {...p}>
    {children}
  </select>
));
export function Field({ label, children, hint, required, className }: { label: string; children: ReactNode; hint?: string; required?: boolean; className?: string }) {
  return (
    <label className={cx('block space-y-1.5', className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

// ---------------- Card / Badge ----------------
export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-anthracite', className)} {...p}>
      {children}
    </div>
  );
}
const badgeTones = {
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  zinc: 'bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-300',
  brand: 'bg-brand/20 text-lime-800 dark:text-brand',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
};
export type Tone = keyof typeof badgeTones;
export function Badge({ tone = 'zinc', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', badgeTones[tone], className)}>{children}</span>;
}

// ---------------- Skeleton / Empty / Spinner ----------------
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('relative overflow-hidden rounded-lg bg-zinc-200 dark:bg-white/10', className)}><div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10" /></div>;
}
export function Empty({ title = 'Aucune donnée', text, action }: { title?: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-zinc-100 dark:bg-white/5"><Inbox className="h-7 w-7 text-zinc-400" /></div>
      <div className="font-semibold">{title}</div>
      {text && <p className="max-w-sm text-sm text-zinc-500">{text}</p>}
      {action}
    </div>
  );
}
export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
      <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1">{(error as Error)?.message || 'Erreur'}</div>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Réessayer</Button>}
    </div>
  );
}
export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('h-5 w-5 animate-spin text-brand', className)} />;

// ---------------- Modal ----------------
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div
            onMouseDown={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className={cx(
              'flex max-h-[92vh] w-full flex-col rounded-t-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl dark:border-white/10 dark:bg-[#12151a] dark:text-white sm:rounded-3xl',
              size === 'sm' && 'sm:max-w-md',
              size === 'md' && 'sm:max-w-2xl',
              size === 'lg' && 'sm:max-w-4xl',
              size === 'xl' && 'sm:max-w-6xl',
            )}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/10">
              <h3 className="text-lg font-bold">{title}</h3>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer"><X className="h-5 w-5" /></Button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-white/10">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------- Toasts & Confirm ----------------
type ToastT = { id: number; type: 'success' | 'error' | 'info'; text: string };
type ConfirmReq = { title: string; text?: string; danger?: boolean; input?: string; resolve: (v: false | string) => void };
const UICtx = createContext<{ toast: (type: ToastT['type'], text: string) => void; confirm: (o: Omit<ConfirmReq, 'resolve'>) => Promise<false | string> }>(null as any);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastT[]>([]);
  const [conf, setConf] = useState<ConfirmReq | null>(null);
  const [val, setVal] = useState('');
  const toast = useCallback((type: ToastT['type'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 7000 : 4000);
  }, []);
  const confirm = useCallback((o: Omit<ConfirmReq, 'resolve'>) => new Promise<false | string>((resolve) => (setVal(''), setConf({ ...o, resolve }))), []);
  const close = (v: false | string) => { conf?.resolve(v); setConf(null); };
  return (
    <UICtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2 rtl:left-4 rtl:right-auto">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-900 shadow-xl dark:border-white/10 dark:bg-[#1b1f26] dark:text-white">
              {t.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /> : t.type === 'error' ? <XCircle className="h-5 w-5 shrink-0 text-red-500" /> : <Info className="h-5 w-5 shrink-0 text-sky-500" />}
              <span className="flex-1">{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <Modal open={!!conf} onClose={() => close(false)} title={conf?.title ?? ''} size="sm"
        footer={<>
          <Button variant="outline" onClick={() => close(false)}>Annuler</Button>
          <Button variant={conf?.danger ? 'danger' : 'primary'} disabled={!!conf?.input && val.trim().length < 3} onClick={() => close(val || 'ok')}>Confirmer</Button>
        </>}>
        <div className="flex gap-3">
          <AlertTriangle className={cx('h-6 w-6 shrink-0', conf?.danger ? 'text-red-500' : 'text-amber-500')} />
          <div className="flex-1 space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
            {conf?.text && <p>{conf.text}</p>}
            {conf?.input && <Field label={conf.input}><Input autoFocus value={val} onChange={(e) => setVal(e.target.value)} /></Field>}
          </div>
        </div>
      </Modal>
    </UICtx.Provider>
  );
}
export const useUI = () => useContext(UICtx);

// ---------------- Tabs ----------------
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1 dark:bg-white/5">
      {items.map((i) => (
        <button key={i.value} onClick={() => onChange(i.value)}
          className={cx('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition', value === i.value ? 'bg-white text-zinc-900 shadow dark:bg-anthracite dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-white')}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, icon, tone = 'zinc', sub }: { label: string; value: ReactNode; icon?: ReactNode; tone?: 'zinc' | 'brand' | 'red' | 'amber' | 'green' | 'blue'; sub?: ReactNode }) {
  const t = { zinc: 'text-zinc-500 bg-zinc-100 dark:bg-white/5', brand: 'text-lime-700 dark:text-brand bg-brand/15', red: 'text-red-600 bg-red-500/10', amber: 'text-amber-600 bg-amber-500/10', green: 'text-emerald-600 bg-emerald-500/10', blue: 'text-sky-600 bg-sky-500/10' }[tone];
  return (
    <Card className="flex items-start gap-3 p-4">
      {icon && <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', t)}>{icon}</div>}
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
        <div className="mt-0.5 text-xl font-extrabold tabular-nums">{value}</div>
        {sub && <div className="text-xs text-zinc-500">{sub}</div>}
      </div>
    </Card>
  );
}
