/**
 * Supabase client configuration
 *
 * SECURITY RULES:
 * - Only the anon key is used here (public, enforced by RLS)
 * - Service-role key MUST NEVER appear in this file or any frontend file
 * - All data access is governed by Row Level Security policies in PostgreSQL
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

const fallbackUrl = 'https://ixhvsprwjalgcyievsrg.supabase.co'
const fallbackAnonKey = 'sb_publishable_NChpgGh4zPuuyKR-nRU2Zg_Wr_16GMe'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackUrl
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackAnonKey

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] Missing environment variables. ' +
      'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file or hosting environment. ' +
      'See .env.example for reference.'
  )
}

/**
 * Supabase client — uses the anon key only.
 * All authorization is enforced through PostgreSQL Row Level Security.
 * This client is safe to use in frontend code.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      'x-application-name': 'community-roots',
    },
  },
})
