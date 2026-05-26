import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) {
  // Surfacing a clear message rather than letting the SDK throw something opaque.
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. ' +
    'Copy .env.example to .env and fill in your Supabase project credentials.'
  );
}

export const supabase = createClient(url, key, {
  realtime: { params: { eventsPerSecond: 10 } },
});
