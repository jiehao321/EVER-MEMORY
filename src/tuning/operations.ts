/**
 * Operational constants — centralized from scattered magic numbers.
 */

/** Maximum memories to fetch for batch operations (browse, housekeeping, compression). */
export const BATCH_SEARCH_LIMIT = 500;

/** Maximum embedding candidates to process in one batch. */
export const EMBEDDING_CANDIDATE_LIMIT = 500;

/** Maximum recent events/records to fetch for status display. */
export const STATUS_RECENT_LIMIT = 200;
