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
 * finds this path in a bundle still cannot spend anything. Nothing here is
 * logged: not the hash, not the password, not the provider's error text.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Failure =
  | 'invalid'
  | 'weak_password'
  | 'expired_or_used'
  | 'same_password'
  | 'rate_limited'
  | 'server';

function reply(body: { ok: true } | { ok: false; failure: Failure }, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return reply({ ok: false, failure: 'server' }, 500);

  let tokenHash = '';
  let password = '';
  try {
    const body = await request.json() as { tokenHash?: unknown; password?: unknown };
    tokenHash = typeof body.tokenHash === 'string' ? body.tokenHash : '';
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return reply({ ok: false, failure: 'invalid' }, 400);
  }

  if (!tokenHash) return reply({ ok: false, failure: 'invalid' }, 400);
  // Checked here as well as in the browser. The browser's copy is a courtesy to
  // somebody typing; this one is the rule, and it is the same module the mobile
  // client reads so all three surfaces demand the same password.
  if (!passwordMeetsPolicy(password)) return reply({ ok: false, failure: 'weak_password' }, 400);

  // Persists nothing, refreshes nothing, reads no address bar. The session
  // verifyOtp returns lives in this closure and dies with the request.
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const { data, error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });
    if (error || !data.session) return reply({ ok: false, failure: 'expired_or_used' }, 400);

    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) {
      const code = (updateError as { code?: string }).code ?? '';
      const status = (updateError as { status?: number }).status ?? 0;
      if (code === 'same_password') return reply({ ok: false, failure: 'same_password' }, 400);
      if (code === 'weak_password') return reply({ ok: false, failure: 'weak_password' }, 400);
      if (status === 429) return reply({ ok: false, failure: 'rate_limited' }, 429);
      return reply({ ok: false, failure: 'server' }, 400);
    }

    // Global, deliberately and unchanged from the previous flow: a password
    // reset is what somebody does when they believe their account is
    // compromised, so every session that password could have opened goes too —
    // including the recovery session this request just created.
    await client.auth.signOut({ scope: 'global' }).catch(() => undefined);
    return reply({ ok: true }, 200);
  } catch {
    return reply({ ok: false, failure: 'server' }, 500);
  }
}
