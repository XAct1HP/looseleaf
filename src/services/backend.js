/**
 * ── The one place that talks to "the backend" ───────────────────────────────
 *
 * Two implementations sit behind this module, chosen by VITE_DATA_MODE:
 *
 *   demo      services/demo.js  — the bundled fictional campus, no network.
 *                                 Dynamically imported so it stays out of the
 *                                 critical path in live mode.
 *   supabase  services/live/*   — real accounts, real profiles, real photos.
 *
 * Rules that hold in both, and must survive anything added later:
 *   1. Ranking never reads any billing or sponsorship table.
 *   2. Incoming likes are always returned in full.
 *   3. No feature here is gated on a plan or entitlement.
 */

export { DATA_MODE, isDemo, supabase, isSupabaseConfigured } from '../lib/supabase'

export * as auth from './live/auth'
export * as profiles from './live/profiles'
export * as events from './live/events'
export * as photos from './live/photos'

/** Loads the demo campus on demand. Only ever called when isDemo is true. */
export const loadDemo = () => import('./demo')
