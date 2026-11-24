import { usePrefs } from '@/lib/prefs';
import { resolveAsset } from '@/lib/api';
import { cx } from '@/lib/format';

const B = import.meta.env.BASE_URL + 'brand/';

/**
 * MAX FIT official logo (from the club's Facebook page), auto-switching with day/night mode:
 *  - night (dark background): silver "MAX" + red "FIT"
 *  - day (light background): anthracite "MAX" + red "FIT"
 * Logos uploaded in the CMS (logoDark / logoLight) take precedence.
 * `compact` shows only the MF monogram (collapsed sidebar, small spaces).
 */
export function Logo({ site, className, forceTheme, compact, size = 'md' }: { site?: any; className?: string; forceTheme?: 'dark' | 'light'; compact?: boolean; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const { theme } = usePrefs();
  const mode = forceTheme ?? theme;
  const custom = mode === 'dark' ? site?.logoDark : site?.logoLight;
  const src = custom ? resolveAsset(custom) : `${B}${compact ? 'mark' : 'logo'}-${mode === 'dark' ? 'night' : 'day'}.png`;
  const h = compact ? 'h-8' : { sm: 'h-10', md: 'h-12', lg: 'h-20', xl: 'h-40' }[size];
  return <img src={src} alt={site?.name || 'MAX FIT — Fitness Club'} className={cx('w-auto select-none object-contain', h, className)} draggable={false} />;
}

/** Brand icons (Facebook, Instagram, WhatsApp) — official colors. */
export function SocialIcon({ kind, className }: { kind: 'facebook' | 'instagram' | 'whatsapp'; className?: string }) {
  if (kind === 'facebook')
    return <svg viewBox="0 0 24 24" className={className} aria-hidden><path fill="currentColor" d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07" /></svg>;
  if (kind === 'instagram')
    return <svg viewBox="0 0 24 24" className={className} aria-hidden><path fill="currentColor" d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0m0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8m6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88" /></svg>;
  return <svg viewBox="0 0 24 24" className={className} aria-hidden><path fill="currentColor" d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.34M12.05 21.8h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.9-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.89 9.88m8.41-18.3A11.81 11.81 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.94L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.8 11.8 0 0 0-3.48-8.41" /></svg>;
}

export const SOCIAL_STYLE = {
  facebook: 'bg-[#1877F2] text-white',
  instagram: 'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white',
  whatsapp: 'bg-[#25D366] text-white',
} as const;

/** Row of colored social buttons (Facebook / Instagram / WhatsApp) built from CMS contact info. */
export function SocialLinks({ contact, size = 'md', className }: { contact?: any; size?: 'sm' | 'md'; className?: string }) {
  if (!contact) return null;
  const wa = contact.whatsapp ? `https://wa.me/${(() => { let p = String(contact.whatsapp).replace(/\D/g, ''); if (p.length === 8) p = '216' + p; return p; })()}` : null;
  const items = [
    ['facebook', contact.facebook, 'Facebook'],
    ['instagram', contact.instagram, 'Instagram'],
    ['whatsapp', wa, 'WhatsApp'],
  ].filter(([, href]) => href) as ['facebook' | 'instagram' | 'whatsapp', string, string][];
  const s = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  return (
    <div className={cx('flex items-center gap-2', className)}>
      {items.map(([k, href, label]) => (
        <a key={k} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}
          className={cx('grid place-items-center rounded-full shadow-md transition hover:-translate-y-0.5 hover:scale-110', s, SOCIAL_STYLE[k])}>
          <SocialIcon kind={k} className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
        </a>
      ))}
    </div>
  );
}
