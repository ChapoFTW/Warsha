import { readFileSync } from 'node:fs';
import { signupLegalManifest } from '../src/legal/signup-legal.ts';
import { passwordMeetsPolicy, PASSWORD_MIN_LENGTH } from '../src/auth/password-policy.ts';
const env = Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/)
  .filter(l => l.includes('=')).map(l => [l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1).trim()]));
const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL, ANON = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!/lrhipbcapzfxuwixfoog/.test(URL_BASE)) throw new Error('wrong project');

const WEAK = 'abc123';               // 6 chars, no upper, no symbol
const STRONG = 'Synthetic!Probe#2026'; // satisfies every rule
console.log('Warsha client PASSWORD_MIN_LENGTH:', PASSWORD_MIN_LENGTH);
console.log('client accepts "abc123":', passwordMeetsPolicy(WEAK));

async function register(password, label) {
  const phone = `+2010${String(Math.floor(Math.random()*90000000)+10000000)}`;
  const res = await fetch(`${URL_BASE}/functions/v1/worker-auth`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action:'register', fullName:'Probe PasswordPolicy', phone,
      password, language:'en', legalAcceptances: signupLegalManifest('worker','en') }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`${label.padEnd(34)} HTTP ${res.status} ${body.code ?? 'session issued'}`);
  return { accepted: res.status === 200, phone };
}

const weak = await register(WEAK, 'register with a weak password');
const strong = await register(STRONG, 'register with a policy-valid one');
console.log();
console.log('weak refused  :', weak.accepted ? 'NO — still accepted' : 'YES');
console.log('valid accepted:', strong.accepted ? 'YES' : 'NO — the path is broken');
if (strong.accepted) console.log('phone created :', strong.phone);
