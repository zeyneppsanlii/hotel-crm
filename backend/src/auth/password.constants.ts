/**
 * bcrypt work factor, per the security baseline (Backend_Architecture, bölüm 13.1).
 *
 * Each increment doubles the work: 12 costs ~4x what 10 did (~200ms vs ~50ms per
 * hash on this machine). That cost is the point — it is what slows an offline
 * cracking attempt against a leaked hash.
 *
 * Raising this does NOT invalidate existing passwords: bcrypt stores the cost
 * inside the hash string (`$2b$10$…`), so hashes written at an older cost keep
 * verifying at that cost. Users are re-hashed at the new cost when they next set
 * a password.
 *
 * Lives in its own leaf module (no imports) so both the app and the standalone
 * `prisma/seed.ts` script can share one source of truth without the seed pulling
 * in the Nest dependency graph.
 */
export const BCRYPT_ROUNDS = 12;
