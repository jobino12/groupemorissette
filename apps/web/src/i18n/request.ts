import { getRequestConfig } from 'next-intl/server';
import { routing, type AppLocale } from './routing';
import frMessages from '@gm/shared/i18n/fr';
import enMessages from '@gm/shared/i18n/en';

const messagesByLocale = { fr: frMessages, en: enMessages } as const;

function isAppLocale(value: string | undefined): value is AppLocale {
  return value !== undefined && (routing.locales as readonly string[]).includes(value);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: AppLocale = isAppLocale(requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: messagesByLocale[locale],
    timeZone: 'America/Toronto',
  };
});
