/**
 * Supabase client for benchmark data persistence.
 *
 * Uses the publishable anon key — only accesses the perf_benchmarks table
 * which has open RLS policies for anonymous read/write.
 *
 * Gracefully degrades: if env vars are missing, exports null and callers
 * fall back to console logging.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase env vars not set — benchmark recording disabled');
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;
