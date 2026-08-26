'use client';

import { useCallback, useEffect, useState } from 'react';

import { PreferenceFooter } from '@/components/preference-controls';
import { AppShell } from '@/components/app-shell';
import { useSession } from '@/components/session-provider';
import { appCopy } from '@/lib/app-copy';
import { customerNavigation } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import type { Route } from 'next';
import styles from '@/components/product-surface.module.css';

type Profile = { displayName: string; phone: string };

/** The ordinary customer account. Auth identity is deliberately not displayed. */
export default function AccountPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const { session, resolution } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    setFailure(false);
    await supabase().rpc('ensure_customer_profile');
    const { data, error } = await supabase().from('profiles')
      .select('display_name,phone')
      .eq('id', session.user.id)
      .single();
    if (error || !data) { setFailure(true); return; }
    const value = { displayName: String(data.display_name ?? ''), phone: String(data.phone ?? '') };
    setProfile(value);
    setName(value.displayName);
  }, [session?.user.id]);

  useEffect(() => { void load(); }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session?.user.id || name.trim().length < 2 || busy) return;
    setBusy(true);
    setFailure(false);
    setSaved(false);
    const { error } = await supabase().from('profiles')
      .update({ display_name: name.trim(), preferred_language: locale })
      .eq('id', session.user.id);
    if (error) setFailure(true);
    else {
      setProfile((current) => current ? { ...current, displayName: name.trim() } : current);
      setSaved(true);
    }
    setBusy(false);
  };

  return (
    <AppShell navigation={customerNavigation(words)} mode={words.modeCustomer}>
      <div className={styles.head}><h1 className={styles.title}>{words.accountTitle}</h1></div>
      <p className={styles.lead}>{words.accountLead}</p>

      <form className={styles.panel} onSubmit={save}>
        <h2 className={styles.sectionTitle}>{words.accountProfile}</h2>
        {profile === null && !failure ? <p className={styles.muted}>{words.loading}</p> : null}
        <label className={styles.field}>
          <span className={styles.label}>{words.accountName}</span>
          <input className={styles.input} value={name} minLength={2} maxLength={120}
            onChange={(event) => setName(event.target.value)} disabled={busy || profile === null} />
        </label>
        <div className={styles.fact}>
          <span className={styles.factLabel}>{words.accountPhone}</span>
          <span className={styles.factValue} dir="ltr">{profile?.phone || words.accountPhoneMissing}</span>
        </div>
        <p className={styles.note}>{words.accountPhoneContactOnly}</p>
        {failure ? <p className={styles.error} role="alert">{words.accountSaveFailed}</p> : null}
        {saved ? <p className={styles.ok} role="status">{words.accountSaved}</p> : null}
        <button type="submit" className={styles.action}
          disabled={busy || profile === null || name.trim().length < 2 || name.trim() === profile.displayName}>
          {busy ? words.loading : words.saveChanges}
        </button>
      </form>

      {resolution.status === 'resolved' && resolution.roles.both ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>{words.accountWorkMode}</h2>
          <p className={styles.muted}>{words.accountWorkModeBody}</p>
          <a className={styles.secondary} href={'/choose-mode' as Route}>{words.accountSwitchMode}</a>
        </section>
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{words.accountPreferences}</h2>
        <p className={styles.muted}>{words.accountPreferencesBody}</p>
        <PreferenceFooter locale={locale} className={styles.accountPreferences} />
      </section>

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{words.legalCentre}</h2>
        <p className={styles.muted}>{words.accountLegalBody}</p>
        <a className={styles.secondary} href={`https://usewarsha.com/${locale}/legal`}>
          {words.viewAll}
        </a>
      </section>
    </AppShell>
  );
}
