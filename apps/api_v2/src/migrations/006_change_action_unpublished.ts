/**
 * `unpublished`: a page taken down from public, which `007`'s trigger logs.
 *
 * A migration of its own because Postgres refuses to use an enum value in the
 * transaction that added it, and each migration runs as one transaction.
 */

export const SQL = `
alter type change_action add value if not exists 'unpublished';
`;
