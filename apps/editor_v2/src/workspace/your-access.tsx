import { UserCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import type { EditorApi } from "../api/client";
import { roleCatalogueQuery, rolesQuery, type RoleDescription } from "../api/queries";
import { Button } from "../ui/button";
import { Popover } from "../ui/popover";

/** "a", "a; and b", "a; b; and c": the API's phrases have commas of their own. */
function series(phrases: readonly string[]): string {
  return phrases.length < 2
    ? phrases.join("")
    : `${phrases.slice(0, -1).join("; ")}; and ${phrases.at(-1)}`;
}

/**
 * The signed-in person's roles and what each lets them do, opened from their email in the top bar. The words come from
 * the API, so a role the editor has never heard of shows as the API describes it.
 */
export function YourAccess({
  api,
  email,
}: {
  api: Pick<EditorApi, "me" | "roles">;
  email: string;
}) {
  const title = useId();
  const [open, setOpen] = useState(false);
  const roles = useQuery(rolesQuery(api));
  const catalogue = useQuery({ ...roleCatalogueQuery(api), enabled: open });

  // In the catalogue's order; a role it doesn't describe still shows by name
  const held: readonly RoleDescription[] =
    roles.data && catalogue.data
      ? [
          ...catalogue.data.filter(({ role }) => roles.data.includes(role)),
          ...roles.data
            .filter((role) => !catalogue.data.some((described) => described.role === role))
            .map((role) => ({ role, lets: [] })),
        ]
      : [];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <Button
            variant="inverse"
            icon={<UserCircle />}
            title={email}
            // Names it by what it shows, the email, then by what it opens
            aria-label={`${email}, your access`}
          >
            <span className="max-w-64 truncate font-normal max-lg:sr-only">{email}</span>
          </Button>
        }
      />
      <Popover.Content aria-labelledby={title} align="end" className="w-88">
        <Popover.Title id={title}>Your access</Popover.Title>
        {roles.isError || catalogue.isError ? (
          <p className="mt-2 text-14 text-ink">We couldn’t check your access.</p>
        ) : held.length === 0 ? (
          <p className="mt-2 text-14 text-ink">Checking your access…</p>
        ) : (
          <>
            <dl className="mt-2 grid gap-3 text-14 text-ink">
              {held.map(({ role, lets }) => (
                <div key={role}>
                  <dt className="font-semibold capitalize">{role}</dt>
                  {lets.length > 0 && <dd>You can {series(lets)}.</dd>}
                </div>
              ))}
            </dl>
            {held.length === 1 && (
              <p className="mt-3 text-14 text-ink">Ask an admin if you need to make changes.</p>
            )}
          </>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}
