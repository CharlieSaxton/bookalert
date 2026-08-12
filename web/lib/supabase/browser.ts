'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabaseConfig } from '@/lib/env';

/**
 * Supabase client for Client Components. Created on demand rather than at module
 * scope so a missing env var becomes a catchable error, not a bundle-time crash.
 */
export function createClient() {
  const { url, anonKey } = supabaseConfig();
  return createBrowserClient(url, anonKey);
}
