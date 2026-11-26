import { X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { ApiFailure, type EditorApi, type Employees } from "../api/client";
import { apiFailureMessages, apiMessage } from "../api/failure-messages";
import {
  meQuery,
  peopleQuery,
  permissionsQuery,
  roleCatalogueQuery,
  type RoleDescription,
} from "../api/queries";
import { cn } from "../cn";
import { Badge, tones } from "../ui/badge";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Drawer } from "../ui/drawer";
import { EmptyState } from "../ui/empty-state";
import { Field, FieldGroup } from "../ui/field";
import { pressedByTouch } from "../ui/focus";
import { FormDialog } from "../ui/form-dialog";
import { Input } from "../ui/input";
import { ListScreen } from "../ui/list-screen";
import { Select } from "../ui/select";
import { Switch } from "../ui/switch";
import { NameCell } from "../ui/table/cell-components";
import {
  createAppColumnHelper,
  useAppTable,
  useTableContext,
  useTableFilters,
} from "../ui/table/table-hooks";
import { TextLink } from "../ui/text-link";
import { toast } from "../ui/toast";
import { listLoadView } from "./list-load-view";

type WaitingRole = Employees["waiting"][number];

/**
 * Someone in the list: a person who has signed in, or an address given roles before its first sign-in. `key` is the
 * signed-in person's id, or the address itself for someone who hasn't signed in, which never goes in the address bar.
 */
interface Person {
  readonly key: string;
  readonly name: string;
  readonly email: string;
  readonly roles: readonly string[];
  /** Set for someone who hasn't signed in yet: the roles waiting for them. */
  readonly waiting?: readonly WaitingRole[];
}

/** Everyone in the list: each signed-in person, and each address with roles waiting, once. */
function peopleOf({ employees, waiting }: Employees): Person[] {
  return [
    ...employees.map(({ id, name, email, roles }) => ({ key: id, name, email, roles })),
    ...[...Map.groupBy(waiting, (role) => role.email)].map(([email, roles]) => ({
      key: email,
      name: "",
      email,
      roles: roles.map(({ role }) => role),
      waiting: roles,
    })),
  ];
}

/** A role given or taken away, as the switch that asked for it. */
interface Change {
  readonly person: Person;
  readonly role: string;
  readonly give: boolean;
}

const column = createAppColumnHelper<Person>();

// A stable empty list: a new [] each render would make the table recount its rows every render
const loading: Person[] = [];

/** The person's name, or their email when they have none. */
const nameOf = (person: Person) => person.name || person.email;

/** A role as the API names it, capitalised to show: "editor" is Editor. */
const roleName = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

// Badge's tints but its red, which would read as something wrong with the person
const initialsTones = [tones.info, tones.success, tones.warning, tones.neutral];

/** Up to two initials in a circle, in the same tint for the same person every time. */
function Initials({ person, large = false }: { person: Person; large?: boolean }) {
  const initials = nameOf(person)
    .split(/[\s.@-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const tone =
    initialsTones[
      [...person.key].reduce((sum, char) => sum + char.charCodeAt(0), 0) % initialsTones.length
    ];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        tone,
        large ? "size-14 text-18" : "size-9 text-12",
      )}
    >
      {initials}
    </span>
  );
}

/** The roles a person holds beyond the one everyone holds, or that they hold only that one. */
function RoleBadges({
  person,
  catalogue,
}: {
  person: Person;
  catalogue: readonly RoleDescription[];
}) {
  const everyone = catalogue.find((description) => description.everyone);

  const held = catalogue.filter(
    (description) =>
      !description.everyone && person.roles.some((role) => role === description.role),
  );

  if (held.length === 0)
    return everyone ? (
      <span className="text-12 text-muted">{roleName(everyone.role)} only</span>
    ) : null;

  return (
    <span className="flex flex-wrap gap-1">
      {held.map(({ role }) => (
        <Badge key={role}>{roleName(role)}</Badge>
      ))}
    </span>
  );
}

/**
 * The toolbar over the list: search by name or email, one role, and Clear filters while either leaves people out. One
 * row while there's room; on a phone the search takes a row of its own.
 */
function PeopleFilters({ roles }: { roles: readonly string[] }) {
  const table = useTableContext();
  const filters = useTableFilters();
  // As Services' toolbar: Clear filters goes once pressed, so focus moves to the search box, or after a tap to the
  // filters themselves
  const searchBox = useRef<HTMLInputElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  // SAFETY: Only the select below sets the roles filter, always as a role's name.
  const role = (table.getColumn("roles")?.getFilterValue() as string | undefined) ?? "";

  return (
    <div
      ref={toolbar}
      role="search"
      aria-label="Filter people"
      tabIndex={-1}
      className="flex flex-wrap items-center gap-2 border-b border-line p-3 outline-none @xl:px-4"
    >
      <table.Search
        ref={searchBox}
        label="Search name or email"
        placeholder="Search name or email"
        className="grow basis-full @xl:max-w-80 @xl:basis-60"
      />
      <Select
        variant="filter"
        aria-label="Role"
        className="grow basis-36 @xl:grow-0 @xl:basis-auto"
        items={[
          { value: "", label: "All roles" },
          ...roles.map((role) => ({ value: role, label: roleName(role) })),
        ]}
        value={role}
        onValueChange={(role) => table.getColumn("roles")?.setFilterValue(role || undefined)}
      />
      {filters.filtered && (
        <Button
          icon={<X />}
          onClick={() => {
            filters.clear();
            (pressedByTouch() ? toolbar : searchBox).current?.focus();
          }}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}

/**
 * Gives roles by email to someone who hasn't signed in yet; they become theirs with their first sign-in. Someone who
 * has signed in changes roles in their own panel instead. A refused address keeps what was typed, with the API's
 * reason beside it.
 */
function AddPersonDialog({
  api,
  open,
  onClose,
  catalogue,
  people,
}: {
  api: EditorApi;
  open: boolean;
  onClose: () => void;
  catalogue: readonly RoleDescription[];
  people: readonly Person[];
}) {
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<readonly string[]>([]);
  const [problems, setProblems] = useState<{ email?: string; roles?: string }>({});
  const everyone = catalogue.find((description) => description.everyone);
  const address = email.trim().toLowerCase();

  const giving = useMutation({
    // One request a role, as the API takes them
    mutationFn: ({ email, roles }: { email: string; roles: readonly string[] }) =>
      Promise.all(roles.map((role) => api.giveWaitingRole(email, role))),
    onSettled: () => client.invalidateQueries({ queryKey: peopleQuery(api).queryKey }),
    onSuccess: (_, given) => {
      toast(`Roles given to ${given.email}`, {
        description: `They get ${new Intl.ListFormat("en").format(given.roles.map(roleName))} when they first sign in.`,
      });
      onClose();
    },
  });

  // The API refused the address itself: its reason goes beside the field while the field still holds that address,
  // and never in the banner, which is for every other failure
  const refusal =
    giving.error instanceof ApiFailure && giving.error.code === "email_not_allowed"
      ? giving.error
      : undefined;

  const refusedAddress =
    refusal && giving.variables?.email === address ? apiMessage(refusal) : undefined;

  const failed =
    giving.error && !refusal
      ? apiFailureMessages(
          giving.error,
          "Try again: a role that was given stays as it is.",
          (field) => (field === "email" ? "Work email" : "Roles"),
        )
      : [];

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add someone"
      description="Give roles to someone who hasn’t signed in yet. They become theirs when they first sign in with this email."
      pending={giving.isPending}
      onSubmit={() => {
        if (giving.isPending) return;

        const signedIn = people.find((person) => !person.waiting && person.email === address);

        const found = {
          email: !address
            ? "Enter their work email."
            : !/^[^\s@]+@[^\s@]+$/.test(address)
              ? "Enter a whole email address, with an @."
              : signedIn
                ? `${nameOf(signedIn)} has signed in already. Open them in the list to change their roles.`
                : undefined,
          roles: roles.length === 0 ? "Choose at least one role." : undefined,
        };

        setProblems(found);

        if (!found.email && !found.roles) giving.mutate({ email: address, roles });
      }}
      actions={
        <Button
          type="submit"
          variant="accent"
          size="md"
          pending={giving.isPending}
          pendingLabel="Giving roles…"
        >
          Give roles
        </Button>
      }
    >
      <Field
        label="Work email"
        hint="The address they’ll sign in with."
        error={refusedAddress ?? problems.email}
      >
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <FieldGroup label="Roles" error={problems.roles}>
        {catalogue
          .filter((description) => !description.everyone)
          .map((description) => (
            <Checkbox
              key={description.role}
              labelClassName="items-start"
              label={
                <>
                  <span className="block font-semibold">{roleName(description.role)}</span>
                  <span className="block text-12 text-muted">
                    Lets them {description.lets.join("; ")}.
                  </span>
                </>
              }
              checked={roles.includes(description.role)}
              onCheckedChange={(checked) =>
                setRoles((chosen) =>
                  checked
                    ? [...chosen, description.role]
                    : chosen.filter((role) => role !== description.role),
                )
              }
            />
          ))}
        {everyone && (
          <p className="text-12 text-muted">
            Everyone has the {roleName(everyone.role)} role as well.
          </p>
        )}
      </FieldGroup>
      {/* The roles go out together, so one may have been given while another failed */}
      {failed.length > 0 && (
        <Banner tone="error" title="Not every role was given">
          {failed.join(" ")}
        </Banner>
      )}
    </FormDialog>
  );
}

/**
 * Who has signed in, or been given roles by email, and which roles they hold, for someone with people:read. A person
 * opens in a panel with a switch per role; with people:manage a switch gives the role or takes it away, from that
 * person's next request, or for someone who hasn't signed in yet, from their first sign-in. Add someone gives roles by
 * email. The roles, what each lets you do, and which one everyone holds come from the API, so a new role needs no
 * change here. `person`, from the address, names the signed-in person whose panel is open, and `onPerson` asks for
 * another, or for none. Someone who hasn't signed in is known only by their email, so their panel stays out of the
 * address.
 */
export function PeopleScreen({
  api,
  person: openId,
  onPerson,
}: {
  api: EditorApi;
  person?: string;
  onPerson: (person: string | undefined) => void;
}) {
  const client = useQueryClient();
  const permissions = useQuery(permissionsQuery(api)).data;
  const read = permissions?.includes("people:read") ?? false;
  const manage = permissions?.includes("people:manage") ?? false;
  // Staff data is asked for only by someone who may see it
  const list = useQuery({ ...peopleQuery(api), enabled: read });
  const catalogue = useQuery({ ...roleCatalogueQuery(api), enabled: read });
  const load = listLoadView(list, "people");
  // Without the roles the list can't say who holds what, so their failure is the list's failure
  const rolesLoad = listLoadView(catalogue, "roles");
  const people = useMemo(() => list.data && peopleOf(list.data), [list.data]);
  // The address of someone who hasn't signed in, whose panel is open
  const [waitingEmail, setWaitingEmail] = useState<string>();
  const [adding, setAdding] = useState(false);
  // A new form each time Add someone opens it
  const [addRound, setAddRound] = useState(0);

  // A person opens once there are roles to show them with
  const open = catalogue.data
    ? (people?.find((person) => !person.waiting && person.key === openId) ??
      people?.find((person) => person.waiting && person.key === waitingEmail))
    : undefined;

  const changing = useMutation({
    mutationFn: async ({ person, role, give }: Change) => {
      if (!person.waiting)
        return give ? api.grantRole(person.key, role) : api.revokeRole(person.key, role);

      if (give) return api.giveWaitingRole(person.email, role);

      const waiting = person.waiting.find((one) => one.role === role);

      if (waiting) await api.takeWaitingRole(waiting.id);
    },
    // Their row goes with their last waiting role, so their panel mustn't open by itself if they're given one again
    onSuccess: (_, { person, give }) => {
      if (!give && person.waiting?.length === 1) setWaitingEmail(undefined);
    },
    // The signed-in admin's own roles may have changed, and with them "Your access" and what the editor offers
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: peopleQuery(api).queryKey }),
        client.invalidateQueries({ queryKey: meQuery(api).queryKey }),
      ]),
  });

  const pending = changing.isPending ? changing.variables : undefined;

  const startAdding = () => {
    // A panel left over from before mustn't open for the address being added
    setWaitingEmail(undefined);
    setAddRound((round) => round + 1);
    setAdding(true);
  };

  const columns = useMemo(
    () =>
      column.columns([
        // Sorted and searched by name then email, so someone with no name sorts by their email
        column.accessor((person) => `${nameOf(person)} ${person.email}`, {
          id: "person",
          header: "Person",
          sortFn: "text",
          enableHiding: false,
          cell: ({ row: { original: person } }) => (
            <div className="flex items-center gap-3">
              <Initials person={person} />
              {/* Someone with no name shows their email once, as their name */}
              <NameCell
                className="flex-1 wrap-break-word"
                name={
                  <TextLink
                    render={
                      person.waiting ? (
                        <Link
                          to="/people"
                          search={{}}
                          replace
                          onClick={() => setWaitingEmail(person.key)}
                        />
                      ) : (
                        <Link to="/people" search={{ person: person.key }} replace />
                      )
                    }
                  >
                    {nameOf(person)}
                  </TextLink>
                }
                path={
                  person.waiting ? (
                    <span className="font-sans">Hasn’t signed in yet</span>
                  ) : person.name ? (
                    person.email
                  ) : null
                }
                details={<RoleBadges person={person} catalogue={catalogue.data ?? []} />}
              />
            </div>
          ),
        }),
        column.accessor("roles", {
          header: "Roles",
          enableSorting: false,
          enableGlobalFilter: false,
          filterFn: (row, _column, role: string) =>
            row.original.roles.some((held) => held === role),
          meta: { secondary: true, width: "w-64" },
          cell: ({ row }) => <RoleBadges person={row.original} catalogue={catalogue.data ?? []} />,
        }),
      ]),
    [catalogue.data],
  );

  const table = useAppTable({
    columns,
    data: people ?? loading,
    getRowId: (person) => person.key,
    // Staff are few: one page, by name
    manualPagination: true,
    initialState: { sorting: [{ id: "person", desc: false }] },
  });

  // In the panel of the person whose change was refused, even one closed while it was on its way and opened again
  const refused =
    changing.error && changing.variables?.person.key === open?.key
      ? apiFailureMessages(
          changing.error,
          "We couldn’t change that role. Try again.",
          (field) => field,
        )[0]
      : undefined;

  const addButton = (variant: "accent" | "secondary") => (
    <Button
      variant={variant}
      size="md"
      // The dialog needs the roles to offer and the people already signed in
      disabled={!manage || !catalogue.data || !people}
      onClick={startAdding}
    >
      Add someone
    </Button>
  );

  return (
    <table.AppTable>
      <ListScreen
        title="People"
        lead="Everyone who has signed in or been given a role, and the roles that decide what they can do. Open someone to change their roles."
        action={read ? addButton("accent") : undefined}
        filters={
          read ? (
            <PeopleFilters
              roles={(catalogue.data ?? [])
                .filter((description) => !description.everyone)
                .map((description) => description.role)}
            />
          ) : undefined
        }
        status={read ? (load.status ?? rolesLoad.status) : undefined}
        notices={
          <>
            {read && !manage && (
              <Banner tone="info" layout="strip" inset="card">
                You can see everyone’s roles, but not give them or take them away.
              </Banner>
            )}
            {read && load.notices}
            {read && rolesLoad.notices}
          </>
        }
        failure={read ? load.failure || rolesLoad.failure : undefined}
      >
        {permissions && !read ? (
          <EmptyState
            size="page"
            title="You can’t see people"
            description="Seeing who has signed in and their roles needs a permission you don’t have. Ask an admin if you need it."
          />
        ) : (
          <table.DataTable
            caption="People"
            loading={!permissions || list.isPending || catalogue.isPending}
            rowLink
            empty={{
              title: "Nobody has signed in yet",
              description:
                "People appear here after their first sign-in, or once they’re given a role by email.",
              actions: addButton("secondary"),
            }}
          />
        )}
      </ListScreen>

      {catalogue.data && people && (
        <AddPersonDialog
          key={addRound}
          api={api}
          open={adding}
          onClose={() => setAdding(false)}
          catalogue={catalogue.data}
          people={people}
        />
      )}

      <Drawer
        open={!!open}
        onOpenChange={(next) => {
          if (next) return;

          if (open?.waiting) setWaitingEmail(undefined);
          else onPerson(undefined);
        }}
        side="end"
        label="Person"
      >
        {open && (
          <div className="flex flex-col gap-6 p-4">
            <div className="flex items-center gap-4">
              <Initials person={open} large />
              <div className="min-w-0">
                <p className="text-18 font-semibold wrap-break-word">{nameOf(open)}</p>
                {open.waiting ? (
                  <p className="text-12 text-muted">Hasn’t signed in yet</p>
                ) : (
                  open.name && (
                    <p className="font-mono text-12 wrap-break-word text-muted">{open.email}</p>
                  )
                )}
              </div>
            </div>
            {refused && (
              <Banner tone="error" title="That didn’t change">
                {refused}
              </Banner>
            )}
            <section aria-labelledby="person-roles">
              {/* A level under the drawer's own h2 title */}
              <h3 id="person-roles" className="mb-1 text-14 font-semibold">
                Roles
              </h3>
              <p className="mb-3 text-14 text-muted">
                {!manage
                  ? "You can see their roles, but not change them."
                  : open.waiting
                    ? "They get these when they first sign in."
                    : "A change applies from their next request."}
              </p>
              <ul role="list" className="divide-y divide-line rounded-sm shadow-input">
                {(catalogue.data ?? []).map((description) => {
                  const changingThis =
                    pending?.person.key === open.key && pending.role === description.role;

                  // Someone who hasn't signed in gets the role everyone holds when they do
                  const held =
                    open.roles.some((role) => role === description.role) ||
                    (!!open.waiting && description.everyone);

                  return (
                    <li key={description.role}>
                      <Switch
                        aria-label={`${description.role} for ${nameOf(open)}`}
                        labelClassName="items-start justify-between gap-4 p-3"
                        className="mt-0.5"
                        label={
                          <>
                            <span className="block font-semibold text-ink">
                              {roleName(description.role)}
                            </span>
                            <span className="mt-0.5 block text-12 text-muted">
                              {description.everyone && "Everyone has this role. "}
                              Lets them {description.lets.join("; ")}.
                            </span>
                          </>
                        }
                        checked={changingThis ? pending.give : held}
                        // One change at a time: the mutation keeps only the latest, so a second would lose the
                        // first's refusal
                        disabled={!manage || description.everyone || changing.isPending}
                        onCheckedChange={(checked) =>
                          changing.mutate({ person: open, role: description.role, give: checked })
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </Drawer>
    </table.AppTable>
  );
}
