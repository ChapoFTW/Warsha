import { createClient } from '@supabase/supabase-js';
export function getAdminClient(){const url=process.env.SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('Set server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in this terminal.');return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})}
