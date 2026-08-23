'use client';

import { useState } from 'react';

import { useStaff } from '@/components/staff-gate';
import { appCopy, type AppWords } from '@/lib/app-copy';
import {
  parseGrantCandidate, type GrantCandidate, type StaffGrant, type StaffRole,
} from '@/lib/console-payloads';
import { isReauthRefusal } from '@/lib/reauth';
import {
  classifyRefusal,
  isSelfGrant,
  isUuid,
  newIdempotencyKey,
  parseGrantResult,
  reasonValid,
  type GrantRefusal,
} from '@/lib/staff-mutations';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/console-table.module.css';

/**
 * Granting and revoking a staff role.
 *
 * Both call the RPCs WPS-017 already built. Every rule they enforce is
 * enforced server-side; this form applies the same rules early so an operator
 * is told before they type a reason for an action that cannot succeed.
 *
 * The two that matter:
 *
 * **No self-grant.** `staff_grant_role` raises 42501 when the subject is the
 * actor. That prohibition *is* the dual control for roles — the second person
 * is the rule that somebody else has to do it — so this form refuses the
 * account's own id rather than inventing an approval queue that does not exist.
 *
 * **A reason is mandatory**, minimum three characters, and it is written into
 * the audit record with the role key and the subject. It is not optional
 * anywhere and the button stays disabled without one.
 *
 * The idempotency key is generated once per form. A double submit returns the
 * first grant with `duplicate: true` rather than creating a second.
 */

/** The status word, without widening AppWords into an index signature. */
function statusWord(words: AppWords, status: string): string {
  const table: Record<string, string> = {
    good_standing: words.grantStatus_good_standing,
    restricted: words.grantStatus_restricted,
    closed: words.grantStatus_closed,
  };
  return table[status] ?? status;
}

export function GrantRoleForm({
  roles,
  onDone,
  onNeedsReauth,
}: {
  roles: StaffRole[];
  onDone: () => void;
  onNeedsReauth: () => void;
}) {
  const locale = useAppLocale();
  const words = appCopy[locale] as AppWords;
  const { session } = useStaff();

  const [subject, setSubject] = useState('');
  const [roleKey, setRoleKey] = useState(roles[0]?.roleKey ?? '');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<GrantRefusal | null>(null);
  const [done, setDone] = useState<'granted' | 'duplicate' | null>(null);
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [lookup, setLookup] = useState('');
  const [candidate, setCandidate] = useState<GrantCandidate | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [searching, setSearching] = useState(false);

  // `staff_lookup_grant_candidate` exists for exactly this: it answers "is this
  // the right person to make staff?" under `manage_staff_roles`, by exact email
  // only, and returns a display name, a masked email, account status and any
  // roles already held. Warsha carries the id; the operator never sees a UUID.
  const find = async () => {
    if (lookup.trim().length < 6 || searching) return;
    setSearching(true);
    setNotFound(false);
    setCandidate(null);
    const { data, error } = await supabase().rpc('staff_lookup_grant_candidate', {
      p_email: lookup.trim(),
    });
    if (error) {
      if (isReauthRefusal(error)) onNeedsReauth();
      else setRefusal('unknown');
    } else {
      const found = parseGrantCandidate(data);
      if (found) { setCandidate(found); setSubject(found.accountId); }
      else setNotFound(true);
    }
    setSearching(false);
  };

  const clearCandidate = () => {
    setCandidate(null);
    setSubject('');
    setNotFound(false);
  };

  const self = isSelfGrant(session.staffId, subject);
  const ready = isUuid(subject) && roleKey && reasonValid(reason) && !self;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setRefusal(null);
    setDone(null);

    const { data, error } = await supabase().rpc('staff_grant_role', {
      p_user_id: subject.trim(),
      p_role_key: roleKey,
      p_reason: reason.trim(),
      p_idempotency_key: idempotencyKey,
      // An expiry is the safer default for a privileged grant, but the server
      // accepts null and the operator decides. Empty means no expiry.
      p_expires_at: expires ? new Date(`${expires}T23:59:59Z`).toISOString() : null,
    });

    if (error) {
      const kind = classifyRefusal(error.message);
      setRefusal(kind);
      if (isReauthRefusal(error)) onNeedsReauth();
      setBusy(false);
      return;
    }

    const result = parseGrantResult(data);
    setDone(result?.duplicate ? 'duplicate' : 'granted');
    setSubject('');
    setReason('');
    setBusy(false);
    onDone();
  };

  return (
    <form className={styles.panel} onSubmit={submit}>
      <h2 className={styles.sectionTitle}>{words.grantTitle}</h2>
      <p className={styles.lead}>{words.grantNotice}</p>

      {/* The account is chosen, never transcribed. Exact email only: this
          confirms which account an address belongs to, it does not browse. */}
      {!candidate ? (
        <div className={styles.filters}>
          <label className={styles.field}>
            <span className={styles.label}>{words.grantFindAccount}</span>
            <input
              className={styles.input}
              type="email"
              value={lookup}
              autoComplete="off"
              onChange={(event) => setLookup(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); void find(); }
              }}
              disabled={busy}
            />
            <span className={styles.hint}>{words.grantFindAccountHelp}</span>
          </label>
          <div className={styles.fieldNarrow}>
            <button type="button" className={styles.rowLink}
              disabled={busy || searching || lookup.trim().length < 6}
              onClick={() => { void find(); }}>
              {searching ? words.loading : words.grantFindAction}
            </button>
          </div>
        </div>
      ) : null}

      {notFound ? <p className={styles.hint} role="status">{words.grantNoMatches}</p> : null}

      {candidate ? (
        <div className={styles.notice} role="status">
          <strong>{candidate.displayName || words.grantUnnamedAccount}</strong>
          <div className={styles.hint}>
            {candidate.emailMasked} · {statusWord(words, candidate.accountStatus)}
          </div>
          <div className={styles.hint}>
            {candidate.staffRoles.length
              ? `${words.grantExistingRoles}: ${candidate.staffRoles
                  .map((role) => roles.find((r) => r.roleKey === role)?.displayName || role)
                  .join(', ')}`
              : words.grantNoExistingRoles}
          </div>
          {candidate.isSelf ? (
            <p className={styles.error} role="alert">{words.grantSelfRefused}</p>
          ) : null}
          <div className={styles.formActions}>
            <button type="button" className={styles.rowLink} onClick={clearCandidate}
              disabled={busy}>
              {words.grantChooseDifferent}
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.filters}>
        <label className={`${styles.field} ${styles.fieldMedium}`}>
          <span className={styles.label}>{words.colRole}</span>
          <select
            className={styles.select}
            value={roleKey}
            onChange={(event) => setRoleKey(event.target.value)}
            disabled={busy}
          >
            {roles.map((role) => (
              <option key={role.roleKey} value={role.roleKey}>
                {role.displayName || role.roleKey}
              </option>
            ))}
          </select>
        </label>

        <label className={`${styles.field} ${styles.fieldNarrow}`}>
          <span className={styles.label}>{words.grantExpiry}</span>
          <input
            className={styles.input}
            type="date"
            dir="ltr"
            value={expires}
            onChange={(event) => setExpires(event.target.value)}
            disabled={busy}
          />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>{words.reasonLabel}</span>
        <input
          className={styles.input}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={busy}
        />
      </label>

      {/* Said before the action, not after it is refused. */}
      {self ? <p className={styles.error} role="alert">{words.grantSelfRefused}</p> : null}
      {refusal ? (
        <p className={styles.error} role="alert">{refusalText(refusal, words)}</p>
      ) : null}
      {done ? (
        <p className={styles.notice} role="status">
          {done === 'duplicate' ? words.grantDuplicate : words.grantDone}
        </p>
      ) : null}

      <div className={styles.formActions}>
        <button type="submit" className={styles.submit} disabled={!ready || busy}>
          {busy ? words.loading : words.grantAction}
        </button>
      </div>
    </form>
  );
}

/**
 * Revoking one grant.
 *
 * Also takes a mandatory reason. Revoking additionally clears the account's
 * session attestations server-side, so an in-flight session cannot keep using a
 * re-authentication it no longer earns — which is why this is safe to offer
 * without a separate "end their sessions" step.
 */
export function RevokeButton({
  grant,
  onDone,
  onNeedsReauth,
}: {
  grant: StaffGrant;
  onDone: () => void;
  onNeedsReauth: () => void;
}) {
  const locale = useAppLocale();
  const words = appCopy[locale] as AppWords;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<GrantRefusal | null>(null);

  const revoke = async () => {
    if (!reasonValid(reason) || busy) return;
    setBusy(true);
    setRefusal(null);
    const { error } = await supabase().rpc('staff_revoke_role', {
      p_grant_id: grant.id,
      p_reason: reason.trim(),
    });
    if (error) {
      setRefusal(classifyRefusal(error.message));
      if (isReauthRefusal(error)) onNeedsReauth();
      setBusy(false);
      return;
    }
    setBusy(false);
    setOpen(false);
    setReason('');
    onDone();
  };

  if (!open) {
    return (
      <button type="button" className={styles.rowLink} onClick={() => setOpen(true)}>
        {words.revokeAction}
      </button>
    );
  }

  return (
    <div>
      <label className={styles.field}>
        <span className={styles.label}>{words.reasonLabel}</span>
        <input
          className={styles.input}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={busy}
        />
      </label>
      {refusal ? (
        <p className={styles.error} role="alert">{refusalText(refusal, words)}</p>
      ) : null}
      <div className={styles.pagerButtons}>
        <button
          type="button"
          className={styles.pagerButton}
          onClick={() => { setOpen(false); setRefusal(null); }}
          disabled={busy}
        >
          {words.cancel}
        </button>
        <button
          type="button"
          className={styles.submit}
          onClick={() => void revoke()}
          disabled={!reasonValid(reason) || busy}
        >
          {busy ? words.loading : words.revokeConfirm}
        </button>
      </div>
    </div>
  );
}

function refusalText(refusal: GrantRefusal, words: AppWords): string {
  switch (refusal) {
    case 'self': return words.grantSelfRefused;
    case 'already-active': return words.grantAlreadyActive;
    case 'unknown-role': return words.grantUnknownRole;
    case 'unknown-account': return words.grantUnknownAccount;
    case 'reason-required': return words.grantReasonRequired;
    case 'reauth': return words.reauthRequired;
    case 'capability': return words.staffRefused;
    default: return words.grantFailed;
  }
}
