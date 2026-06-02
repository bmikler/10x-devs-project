/**
 * The canonical name of the per-(user, year) implicit system category. It is
 * seeded by the create-category route and reserved: a user cannot create a
 * category with this name (case-insensitively), and it shares the unique
 * `(user_id, year, name)` space with user rows.
 */
export const SYSTEM_OTHER_NAME = "other";

/** The two budget category types, mirrored from the DB CHECK constraint. */
export const CATEGORY_TYPES = ["recurring", "irregular"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];
