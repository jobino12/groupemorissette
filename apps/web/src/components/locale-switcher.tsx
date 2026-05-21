'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex gap-1 text-sm">
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => router.replace(pathname, { locale: l })}
          className={`px-2 py-1 rounded ${
            l === locale ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
          }`}
          aria-current={l === locale}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
