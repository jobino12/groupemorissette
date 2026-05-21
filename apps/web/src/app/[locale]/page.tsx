import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="min-h-screen p-8">
      <header className="flex items-center justify-between border-b pb-4 mb-8">
        <h1 className="text-2xl font-semibold">{t('common.appName')}</h1>
        <LocaleSwitcher />
      </header>
      <section>
        <h2 className="text-3xl font-bold mb-2">{t('dashboard.title')}</h2>
        <p className="text-muted-foreground">{t('dashboard.welcome')}</p>
      </section>
    </main>
  );
}
