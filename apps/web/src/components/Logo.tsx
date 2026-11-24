import { usePrefs } from '@/lib/prefs';
import { resolveAsset } from '@/lib/api';
import { cx } from '@/lib/format';

/**
 * MAX FIT logo. Automatically switches variant with day/night mode:
 *  - night (dark): white wordmark + electric green mark
 *  - day (light): black wordmark + dark mark with green accent
 * Custom logos uploaded in the CMS (logoDark / logoLight) take precedence.
 */
export function Logo({ site, className, forceTheme, compact }: { site?: any; className?: string; forceTheme?: 'dark' | 'light'; compact?: boolean }) {
  const { theme } = usePrefs();
  const mode = forceTheme ?? theme;
  const custom = mode === 'dark' ? site?.logoDark : site?.logoLight;
  if (custom) return <img src={resolveAsset(custom)} alt={site?.name || 'MAX FIT'} className={cx('h-10 w-auto object-contain', className)} />;
  const dark = mode === 'dark';
  const name: string = site?.name || 'MAX FIT';
  const [a, ...rest] = name.split(' ');
  return (
    <span className={cx('inline-flex select-none items-center gap-2.5', className)} aria-label={name}>
      <svg viewBox="0 0 48 48" className="h-10 w-10 shrink-0" aria-hidden>
        <rect x="2" y="2" width="44" height="44" rx="12" fill={dark ? '#BEF264' : '#0B0D10'} />
        <path d="M11 34V14h5l8 11 8-11h5v20h-5V22l-8 10.5L16 22v12z" fill={dark ? '#0B0D10' : '#BEF264'} />
        <rect x="31" y="31" width="6" height="3" rx="1.5" fill={dark ? '#0B0D10' : '#FFFFFF'} />
      </svg>
      {!compact && (
        <span className="font-display text-[1.9rem] leading-none tracking-wider" dir="ltr">
          <span className={dark ? 'text-white' : 'text-ink'}>{a}</span>
          {rest.length > 0 && <span className={dark ? 'text-brand' : 'text-lime-600'}> {rest.join(' ')}</span>}
        </span>
      )}
    </span>
  );
}
