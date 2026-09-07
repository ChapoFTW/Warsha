import { createClient } from '@supabase/supabase-js';

import { passwordMeetsPolicy } from '@/src/auth/password-policy';

/**
 * The only place a recovery token is ever spent.
 *
 * ## Why this route exists
 *
 * The email used to link to `/auth/v1/verify`, which CONSUMES the single-use
 * recovery token on the first GET and answers with a session in the URL
 * fragment. Mail scanners, link expanders and preview generators fetch links
 * automatically, so the token was routinely spent before the person clicked:
 * they then reached a password form built on a credential that had already been
 * used, typed a new password, and were told the link had expired. Sending a
 * second email did the same thing, because the second link was scanned too.
 *
 * The email now carries a TOKEN HASH to a Warsha page. A token hash is inert
 * until somebody exchanges it, so any number of GETs — by scanners, by
 * previews, by the person refreshing — change nothing at all. The exchange
 * happens exactly once, here, in response to a deliberate POST carrying a
 * password the person typed.
 *
 * ## Why it is on the server
 *
 * `verifyOtp` returns a real session. Done in a browser, that session is a
 * bearer token the page can hold and other code can find; done here, it exists
 * for the length of one request, in one function scope, on a client that
 * persists nothing. The browser sends a token hash and a password and receives
 * a verdict. No access token, no refresh token, and nothing to put in storage.
 *
 * ## What this route will not do
 *
 * There is no GET handler. A GET is answered 405 by Next, so a scanner that
 * finds this path in a bundle still cannot spend anything. The hash, the
 * password and the provider's error text are never logged.
 *
 * ## Why an authenticator code belongs here
 *
 * A recovery session begins at `aal1`. When the account holds a verified TOTP
 * factor, GoTrue refuses to change the password on it — `insufficient_aal`,
 * HTTP 401, "AAL2 session is required to update email or password when MFA is
 * enabled." That refusal is correct and must not be worked around: without it,
 * whoever reads the mailbox defeats the authenticator, which is most of what
 * the authenticator is for.
 *
 * So the challenge is completed HERE, in the same request, on the same session
 * `verifyOtp` returned. It has to be the same request because `verifyOtp`
 * spends the token: a design that discovered the requirement, gave up, and
 * asked the person to try again would burn their link to learn something it
 * could have been told up front. The browser therefore sends the code with the
 * password, and the page asks for it before submitting.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Failure =
  | 'invalid'
  | 'weak_password'
  | 'expired_or_used'
  | 'same_password'
  | 'rate_limited'
  | 'mfa_required'
  | 'mfa_invalid'
  | 'server';

/**
 * Which part of the transaction did not complete.
 *
 * The route deliberately tells the browser very little, which is right — and it
 * left nobody able to tell WHY a recovery failed, which is not. A live failure
 * was reported as "something went wrong on our side" and the deployment logs
 * held one line: the request, and its status. The provider's actual answer
 * (`insufficient_aal`) existed only inside a caught error.
 *
 * These steps are named so the next failure is legible from a log line alone.
 */
type Step = 'parse' | 'shape' | 'policy' | 'verify' | 'assurance' | 'challenge'
  | 'update' | 'revoke' | 'done';

/**
 * A diagnostic that cannot carry a credential, by construction.
 *
 * Every field is either a literal from this file or a value bounded on the way
 * in: `provider_code` must look like an error code, `http_status` must be a
 * plausible status. There is no field for a token, a hash, a password, a header
 * or a message — the provider's text is unbounded and routinely quotes its
 * input, which is exactly the thing that must not be written down.
 */
function diagnose(step: Step, failure: Failure | 'none', evidence: {
  code?: unknown; status?: unknown;
} = {}) {
  const code = typeof evidence.code === 'string' ? evidence.code : '';
  const status = Number(evidence.status ?? 0);
  console.info(JSON.stringify({
    operation: 'password-recovery',
    step,
    failure_class: failure,
    provider_code: /^[a-z0-9_]{1,64}$/i.test(code) ? code : undefined,
    http_status: status >= 100 && status <= 599 ? status : undefined,
  }));
}

function reply(body: { ok: true } | { ok: false; failure: Failure }, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function fail(step: Step, failure: Failure, status: number, evidence: {
  code?: unknown; status?: unknown;
} = {}) {
  diagnose(step, failure, evidence);
  return reply({ ok: false, failure }, status);
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return reply({ ok: false, failure: 'server' }, 500);

  let tokenHash = '';
  let password = '';
  let code = '';
  let type = 'recovery';
  try {
    const body = await request.json() as
      { tokenHash?: unknown; password?: unknown; type?: unknown; code?: unknown };
    tokenHash = typeof body.tokenHash === 'string' ? body.tokenHash : '';
    password = typeof body.password === 'string' ? body.password : '';
    code = typeof body.code === 'string' ? body.code.trim() : '';
    if (typeof body.type === 'string') type = body.type;
  } catch {
    return fail('parse', 'invalid', 400);
  }

  if (!tokenHash) return fail('shape', 'invalid', 400);
  // This route exists for ONE callback type. A caller asking to spend a signup
  // or email-change token here is refused rather than quietly served, so the
  // route cannot be turned into a general-purpose token exchanger.
  if (type !== 'recovery') return fail('shape', 'invalid', 400);
  // A hash is opaque, but it is not arbitrary text. Bounding its shape keeps a
  // hostile body from reaching the provider at all.
  if (tokenHash.length > 512 || /[\s<>"']/.test(tokenHash)) {
    return fail('shape', 'invalid', 400);
  }
  // Six digits or nothing. An authenticator code has exactly one shape, and
  // bounding it here means a hostile body cannot use this field to reach the
  // provider with anything else.
  if (code && !/^[0-9]{6}$/.test(code)) return fail('shape', 'mfa_invalid', 400);
  // Checked here as well as in the browser. The browser's copy is a courtesy to
  // somebody typing; this one is the rule, and it is the same module the mobile
  // client reads so all three surfaces demand the same password.
  if (!passwordMeetsPolicy(password)) return fail('policy', 'weak_password', 400);

  // Persists nothing, refreshes nothing, reads no address bar. The session
  // verifyOtp returns lives in this closure and dies with the request.
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Tracks where the request actually got to, so an unexpected throw reports the
  // step it happened at rather than a guess. The first version of this always
  // said `update`, which would have been wrong for most of the ways it can fail.
  let reached: Step = 'verify';

  try {
    const { data, error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });
    if (error || !data.session) {
      return fail('verify', 'expired_or_used', 400, error ?? {});
    }

    /*
     * The recovery session is `aal1`. If the account holds a verified factor,
     * the provider requires `aal2` before the password may change, so the
     * challenge is completed on this same session before `updateUser` is
     * attempted at all.
     *
     * Asking the provider rather than assuming: `nextLevel` is `aal2` only when
     * a verified factor exists, so an account without one never sees a code
     * field and never has an extra step.
     */
    reached = 'assurance';
    const { data: assurance, error: assuranceError } =
      await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) {
      return fail('assurance', 'server', 400, assuranceError);
    }

    if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
      if (!code) {
        // Said plainly rather than as a server error, and said BEFORE the
        // password is touched, so the page can ask for the code.
        return fail('assurance', 'mfa_required', 400);
      }
      reached = 'challenge';
      const { data: factors, error: listError } = await client.auth.mfa.listFactors();
      if (listError) return fail('challenge', 'server', 400, listError);
      const factor = (factors?.totp ?? [])[0];
      if (!factor) return fail('challenge', 'server', 400);

      const { error: challengeError } = await client.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code,
      });
      if (challengeError) {
        const challengeStatus = (challengeError as { status?: number }).status ?? 0;
        if (challengeStatus === 429) return fail('challenge', 'rate_limited', 429, challengeError);
        // A wrong or stale code is an ordinary mistake, not a server fault. The
        // token is already spent, so the page says so and offers a new link.
        return fail('challenge', 'mfa_invalid', 400, challengeError);
      }
    }

    reached = 'update';
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) {
      const providerCode = (updateError as { code?: string }).code ?? '';
      const status = (updateError as { status?: number }).status ?? 0;
      if (providerCode === 'same_password') {
        return fail('update', 'same_password', 400, updateError);
      }
      if (providerCode === 'weak_password') {
        return fail('update', 'weak_password', 400, updateError);
      }
      // Belt and braces. The assurance check above should have caught this, and
      // if the provider ever reaches it by another route the person is told to
      // enter a code rather than that Warsha broke.
      if (providerCode === 'insufficient_aal') {
        return fail('update', 'mfa_required', 400, updateError);
      }
      if (status === 429) return fail('update', 'rate_limited', 429, updateError);
      return fail('update', 'server', 400, updateError);
    }

    // Global, deliberately and unchanged from the previous flow: a password
    // reset is what somebody does when they believe their account is
    // compromised, so every session that password could have opened goes too —
    // including the recovery session this request just created.
    reached = 'revoke';
    await client.auth.signOut({ scope: 'global' }).catch(() => undefined);
    diagnose('done', 'none');
    return reply({ ok: true }, 200);
  } catch (error) {
    return fail(reached, 'server', 500, error as { code?: unknown; status?: unknown });
  }
}
