/** Amounts are stored in millimes (1 TND = 1000 millimes). */
export const toTND = (m: number | null | undefined) => (Number(m || 0) / 1000);
export const money = (m: number | null | undefined, withCur = true) =>
  new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(toTND(m)) + (withCur ? ' DT' : '');
export const moneyShort = (m: number | null | undefined) => {
  const v = toTND(m);
  return new Intl.NumberFormat('fr-TN', { maximumFractionDigits: v >= 100 ? 0 : 1 }).format(v) + ' DT';
};
export const toMillimes = (v: string | number) => Math.round(Number(String(v).replace(',', '.').replace(/\s/g, '')) * 1000) || 0;

export const todayISO = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
export const startOfWeek = (d: string) => {
  const x = new Date(d + 'T00:00:00Z');
  return addDays(d, -((x.getUTCDay() + 6) % 7));
};
export const fmtDate = (d?: string | null, locale = 'fr-FR') => {
  if (!d) return '—';
  const x = new Date(d.length === 10 ? d + 'T00:00:00' : d.replace(' ', 'T'));
  return isNaN(x.getTime()) ? d : x.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
};
export const fmtDateTime = (d?: string | null) => (d ? `${fmtDate(d)} ${d.slice(11, 16)}` : '—');
export const minutesToH = (m: number) => `${Math.floor((m || 0) / 60)}h${String((m || 0) % 60).padStart(2, '0')}`;
export const ageOf = (birth?: string | null) => {
  if (!birth) return null;
  const t = todayISO();
  let a = Number(t.slice(0, 4)) - Number(birth.slice(0, 4));
  if (t.slice(5) < birth.slice(5)) a--;
  return a;
};
export const waLink = (phone: string | null | undefined, text: string) => {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.length === 8) p = '216' + p;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
};
export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
