/**
 * A read-only Google access token for the Test Lab scripts.
 *
 * These scripts inspect the Test Lab catalogue and nothing else; they need a
 * bearer token and no other authority. It comes from the credential the owner
 * already granted to the Firebase CLI, which firebase-tools keeps in its own
 * configstore.
 *
 * The client id and secret below are NOT Warsha credentials and are not secret
 * in any meaningful sense: they are firebase-tools' own installed-application
 * OAuth client, shipped in its npm package and identical for every user on
 * earth. An installed application cannot keep a secret — which is exactly why
 * OAuth classes this kind of client as public. What IS sensitive is the refresh
 * token in the configstore, and that is read from disk, exchanged once, and
 * never printed or returned.
 *
 * Set GOOGLE_OAUTH_ACCESS_TOKEN to bypass the configstore entirely. That is how
 * CI should supply a workload-identity token instead of a person's own.
 */
import { readFileSync } from 'node:fs';

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? '';
const CONFIG = `${HOME}/.config/configstore/firebase-tools.json`;
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

export async function accessToken() {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

  let tokens;
  try {
    tokens = JSON.parse(readFileSync(CONFIG, 'utf8')).tokens ?? {};
  } catch {
    throw new Error('No Firebase CLI credential on this machine. Sign in with '
      + 'firebase-tools, or set GOOGLE_OAUTH_ACCESS_TOKEN.');
  }

  // Refresh slightly early: a token that expires mid-catalogue read fails in a
  // far more confusing way than one that was replaced before the first request.
  if (tokens.access_token && tokens.expires_at > Date.now() + 60_000) return tokens.access_token;

  if (!tokens.refresh_token) {
    throw new Error('The stored Firebase credential carries no refresh token; sign in again.');
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token, grant_type: 'refresh_token',
    }),
  });
  const body = await response.json().catch(() => ({}));
  // Reports the status and the error CODE only. A failed token exchange can
  // echo submitted credential material back in its body.
  if (!response.ok || !body.access_token) {
    throw new Error(`token refresh failed: HTTP ${response.status} ${body.error ?? ''}`.trim());
  }
  return body.access_token;
}
