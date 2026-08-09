export type AuthCallbackKind = 'signup' | 'recovery';

export type AuthCallbackParameters = {
  kind: AuthCallbackKind | null;
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  error?: string;
};

export type CustomerSignUpResult = {
  needsEmailConfirmation: boolean;
  accountId: string | null;
};

type SignUpResponseShape = {
  session: unknown | null;
  user: {
    id?: string | null;
    confirmation_sent_at?: string | null;
  } | null;
};

/**
 * Supabase documents two password-signup outcomes: a returned session when
 * confirmation is disabled, or a returned user with no session when email
 * confirmation is required. The returned user can be deliberately obfuscated
 * for a duplicate signup, including plausible timestamps, so no response field
 * is treated as proof that an account was created or an email was sent.
 */
export function customerSignUpResult(data: SignUpResponseShape): CustomerSignUpResult {
  if (data.session) {
    return {
      needsEmailConfirmation: false,
      accountId: data.user?.id ?? null,
    };
  }

  return {
    needsEmailConfirmation: true,
    accountId: data.user?.id ?? null,
  };
}

/** Parse both implicit-token and PKCE Auth redirects without logging secrets. */
export function readAuthCallbackParameters(url: string): AuthCallbackParameters {
  const queryStart = url.indexOf('?');
  const fragmentStart = url.indexOf('#');
  const queryEnd = fragmentStart >= 0 ? fragmentStart : url.length;
  const query = queryStart >= 0 ? url.slice(queryStart + 1, queryEnd) : '';
  const fragment = fragmentStart >= 0 ? url.slice(fragmentStart + 1) : '';
  const parameters = new URLSearchParams(query);
  new URLSearchParams(fragment).forEach((value, key) => parameters.set(key, value));

  const type = parameters.get('type')?.toLowerCase();
  const path = url.split(/[?#]/, 1)[0].toLowerCase();
  const kind = type === 'recovery' || path.includes('reset-password')
    ? 'recovery'
    : type === 'signup' || type === 'email' || path.includes('auth/confirm')
      ? 'signup'
      : null;

  return {
    kind,
    accessToken: parameters.get('access_token') ?? undefined,
    refreshToken: parameters.get('refresh_token') ?? undefined,
    code: parameters.get('code') ?? undefined,
    error: parameters.get('error_description')
      ?? parameters.get('error_code')
      ?? parameters.get('error')
      ?? undefined,
  };
}
