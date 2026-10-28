/**
 * `submitted`, `rejected` and `approved`: the review steps a page's revision
 * takes, which `013`'s trigger logs (#3200).
 *
 * A migration of its own, like `006`, because Postgres refuses to use an enum
 * value in the transaction that added it, and each migration runs as one
 * transaction.
 */

export const SQL = `
alter type change_action add value if not exists 'submitted';
alter type change_action add value if not exists 'rejected';
alter type change_action add value if not exists 'approved';
`;
