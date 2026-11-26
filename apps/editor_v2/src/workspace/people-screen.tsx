import { X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useRef } from "react";
import type { EditorApi, Employees } from "../api/client";
import { apiFailureMessages } from "../api/failure-messages";
import {
  employeesQuery,
  permissionsQuery,
  roleCatalogueQuery,
  type RoleDescription,
} from "../api/queries";
import { cn } from "../cn";
import { Badge, tones } from "../ui/badge";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Drawer } from "../ui/drawer";
import { EmptyState } from "../ui/empty-state";
import { pressedByTouch } from "../ui/focus";
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
import { listLoadView } from "./list-load-view";

type Employee = Employees["employees"][number];

/** A role given or taken away, as the switch that asked for it. */
interface Change {
  readonly id: string;
  readonly role: string;
  readonly give: boolean;
}

const column = createAppColumnHelper<Employee>();

// A stable empty list: a new [] each render would make the table recount its rows every render
const loading: Employee[] = [];

/** The person's name, or their email when they have none. */
const nameOf = (employee: Employee) => employee.name || employee.email;

/** A role as the API names it, capitalised to show: "editor" is Editor. */
const roleName = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

// Badge's tints but its red, which would read as something wrong with the person
const initialsTones = [tones.info, tones.success, tones.warning, tones.neutral];

/** Up to two initials in a circle, in the same tint for the same person every time. */
function Initials({ employee, large = false }: { employee: Employee; large?: boolean }) {
  const initials = nameOf(employee)
    .split(/[\s.@-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const tone =
    initialsTones[
      [...employee.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % initialsTones.length
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
  employee,
  catalogue,
}: {
  employee: Employee;
  catalogue: readonly RoleDescription[];
}) {
  const everyone = catalogue.find((description) => description.everyone);

  const held = catalogue.filter(
    (description) =>
      !description.everyone && employee.roles.some((role) => role === description.role),
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
 * Who has signed in and which roles they hold, for someone with people:read. A person opens in a panel with a switch
 * per role; with people:manage a switch gives the role or takes it away, from that person's next request. The roles,
 * what each lets you do, and which one everyone holds come from the API, so a new role needs no change here. `person`,
 * from the address, names the person whose panel is open, and `onPerson` asks for another, or for none.
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
  const employees = useQuery({ ...employeesQuery(api), enabled: read });
  const catalogue = useQuery({ ...roleCatalogueQuery(api), enabled: read });
  const load = listLoadView(employees, "people");
  const open = employees.data?.find((employee) => employee.id === openId);

  const changing = useMutation({
    mutationFn: ({ id, role, give }: Change) =>
      give ? api.grantRole(id, role) : api.revokeRole(id, role),
    onSettled: () => client.invalidateQueries({ queryKey: employeesQuery(api).queryKey }),
  });

  const pending = changing.isPending ? changing.variables : undefined;

  const columns = useMemo(
    () =>
      column.columns([
        // Sorted and searched by name then email, so someone with no name sorts by their email
        column.accessor((employee) => `${nameOf(employee)} ${employee.email}`, {
          id: "person",
          header: "Person",
          sortFn: "text",
          enableHiding: false,
          cell: ({ row: { original: employee } }) => (
            <div className="flex items-center gap-3">
              <Initials employee={employee} />
              {/* Someone with no name shows their email once, as their name */}
              <NameCell
                className="flex-1 wrap-break-word"
                name={
                  <TextLink render={<Link to="/people" search={{ person: employee.id }} replace />}>
                    {nameOf(employee)}
                  </TextLink>
                }
                path={employee.name ? employee.email : null}
                details={<RoleBadges employee={employee} catalogue={catalogue.data ?? []} />}
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
          cell: ({ row }) => (
            <RoleBadges employee={row.original} catalogue={catalogue.data ?? []} />
          ),
        }),
      ]),
    [catalogue.data],
  );

  const table = useAppTable({
    columns,
    data: employees.data ?? loading,
    getRowId: (employee) => employee.id,
    // Staff are few: one page, by name
    manualPagination: true,
    initialState: { sorting: [{ id: "person", desc: false }] },
  });

  const refused = changing.error
    ? apiFailureMessages(
        changing.error,
        "We couldn’t change that role. Try again.",
        (field) => field,
      )[0]
    : undefined;

  return (
    <table.AppTable>
      <ListScreen
        title="People"
        lead="Everyone who has signed in, and the roles that decide what they can do. Open someone to give them a role or take one away."
        filters={
          read ? (
            <PeopleFilters
              roles={(catalogue.data ?? [])
                .filter((description) => !description.everyone)
                .map((description) => description.role)}
            />
          ) : undefined
        }
        status={read ? load.status : undefined}
        notices={
          <>
            {read && !manage && (
              <Banner tone="info" layout="strip" inset="card">
                You can see everyone’s roles, but not give them or take them away.
              </Banner>
            )}
            {read && load.notices}
          </>
        }
        failure={read ? load.failure : undefined}
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
            loading={!permissions || employees.isPending || catalogue.isPending}
            rowLink
            empty={{
              title: "Nobody has signed in yet",
              description: "People appear here after their first sign-in.",
            }}
          />
        )}
      </ListScreen>

      <Drawer
        open={!!open}
        onOpenChange={(next) => {
          if (next) return;

          // A refusal belongs to the panel it was shown in
          changing.reset();
          onPerson(undefined);
        }}
        side="end"
        label="Person"
      >
        {open && (
          <div className="flex flex-col gap-6 p-4">
            <div className="flex items-center gap-4">
              <Initials employee={open} large />
              <div className="min-w-0">
                <p className="text-18 font-semibold wrap-break-word">{nameOf(open)}</p>
                {open.name && (
                  <p className="font-mono text-12 wrap-break-word text-muted">{open.email}</p>
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
                {manage
                  ? "A change applies from their next request."
                  : "You can see their roles, but not change them."}
              </p>
              <ul role="list" className="divide-y divide-line rounded-sm shadow-input">
                {(catalogue.data ?? []).map((description) => {
                  const changingThis = pending?.id === open.id && pending.role === description.role;

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
                        checked={
                          changingThis
                            ? pending.give
                            : open.roles.some((held) => held === description.role)
                        }
                        disabled={!manage || description.everyone || changingThis}
                        onCheckedChange={(checked) =>
                          changing.mutate({ id: open.id, role: description.role, give: checked })
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
