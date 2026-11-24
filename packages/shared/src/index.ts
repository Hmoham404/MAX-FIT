/** Shared constants between API and web. Amounts are integers in millimes (1 TND = 1000). */
export const CURRENCY = 'TND';
export const TIMEZONE = 'Africa/Tunis';
export const ROLES = ['super_admin', 'admin', 'receptionist', 'coach'] as const;
export type Role = (typeof ROLES)[number];
export const PAYMENT_METHODS = ['cash', 'transfer', 'card', 'cheque', 'other'] as const;
export const toMillimes = (tnd: number) => Math.round(tnd * 1000);
export const fromMillimes = (m: number) => m / 1000;
export const DOC_PREFIX = { quotation: 'DEV', invoice: 'FAC', receipt: 'REC', payslip: 'PAIE' } as const;