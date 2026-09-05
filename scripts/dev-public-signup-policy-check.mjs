import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/)
  .filter(l => l.includes('=')).map(l => [l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1).trim()]));
const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL, ANON = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!/lrhipbcapzfxuwixfoog/.test(URL_BASE)) throw new Error('wrong project');
for (const [label, pw] of [['6 chars  ', 'abc123'], ['8 chars  ', 'abc12345']]) {
  const res = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `probe-${Date.now()}@example.com`, password: pw }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`${label} -> HTTP ${res.status} ${body.error_code ?? body.code ?? ''} ${(body.msg ?? '').slice(0,80)}`);
}
