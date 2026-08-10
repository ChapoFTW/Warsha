import { getAdminClient } from './supabase-admin-client.mjs';
import { signupLegalManifest } from '../src/legal/signup-legal.ts';

const email = process.env.DEV_AUTH_EMAIL;
const password = process.env.DEV_AUTH_PASSWORD;
const displayName = process.env.DEV_AUTH_NAME ?? 'Warsha Test Customer';
if (!email || !password) throw new Error('Set DEV_AUTH_EMAIL and DEV_AUTH_PASSWORD in this terminal.');
if (process.env.DEV_AUTH_ROLE === 'provider') {
  throw new Error('Worker accounts must be created through the trusted worker registration flow.');
}
const { data, error } = await getAdminClient().auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: {
    display_name: displayName,
    preferred_language: 'en',
    account_role: 'customer',
    legal_acceptances: signupLegalManifest('customer', 'en'),
  },
});
if (error) throw error;
console.log(`Created development Auth user ${data.user.id}.`);
