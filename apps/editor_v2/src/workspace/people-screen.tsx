import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, use, useMemo } from "react";
import type { EditorApi, Employees } from "../api/client";
import { apiFailureMessages } from "../api/failure-messages";
import {
  employeesQuery,
  permissionsQuery,
  roleCatalogueQuery,
  type RoleDescription,
} from "../api/queries";
import { Banner } from "../ui/banner";
import { Checkbox } from "../ui/checkbox";
import { EmptyState } from "../ui/empty-state";
import { ListScreen } from "../ui/list-screen";
import { NameCell } from "../ui/table/cell-components";
import { createAppColumnHelper, useAppTable } from "../ui/table/table-hooks";
import { listLoadView } from "./list-load-view";

type Employee = Employees["employees"][number];

/** A role given or taken away, as the box that asked for it. */
interface Change {
  readonly id: string;
  readonly role: string;
  readonly give: boolean;
}

/** What a role's box needs from the screen: whether it may change, and the change on its way. */
const RoleChanges = createContext<{
  readonly manage: boolean;
  readonly pending: Change | undefined;
  readonly change: (change: Change) => void;
}>({ manage: false, pending: undefined, change: () => {} });

const column = createAppColumnHelper<Employee>();

// A stable empty list: a new [] each render would make the table recount its rows every render
const loading: Employee[] = [];

/** The person's name, or their email when they have none. */
const nameOf = (employee: Employee) => employee.name || employee.email;

/** One role's box for one person: ticked when they hold it, and off for the role everyone holds. */
function RoleBox({ employee, description }: { employee: Employee; description: RoleDescription }) {
  const { manage, pending, change } = use(RoleChanges);
  const changing = pending?.id === employee.id && pending.role === description.role;

  return (
    <Checkbox
      aria-label={`${description.role} for ${nameOf(employee)}`}
      checked={changing ? pending.give : employee.roles.some((held) => held === description.role)}
      disabled={!manage || description.everyone || changing}
      onCheckedChange={(checked) =>
        change({ id: employee.id, role: description.role, give: checked })
      }
    />
  );
}

/**
 * Who has signed in and which roles they hold, for someone with people:read; with people:manage, a role's box gives it
 * or takes it away, from that person's next request. The roles, and which one everyone holds, come from the API, so a
 * new role gets a column with no change here.
 */
export function PeopleScreen({ api }: { api: EditorApi }) {
  const client = useQueryClient();
  const permissions = useQuery(permissionsQuery(api)).data;
  const read = permissions?.includes("people:read") ?? false;
  const manage = permissions?.includes("people:manage") ?? false;
  // Staff data is asked for only by someone who may see it
  const employees = useQuery({ ...employeesQuery(api), enabled: read });
  const catalogue = useQuery({ ...roleCatalogueQuery(api), enabled: read });
  const load = listLoadView(employees, "people");

  const changing = useMutation({
    mutationFn: ({ id, role, give }: Change) =>
      give ? api.grantRole(id, role) : api.revokeRole(id, role),
    onSettled: () => client.invalidateQueries({ queryKey: employeesQuery(api).queryKey }),
  });

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor("email", {
          header: "Person",
          sortFn: "text",
          enableHiding: false,
          // Wide enough to read on a phone, where the table then scrolls sideways
          meta: { width: "@max-xl:w-48" },
          cell: ({ row: { original: employee } }) => (
            // Someone with no name shows their email once, as their name
            <NameCell
              name={nameOf(employee)}
              path={employee.name ? employee.email : null}
              className="wrap-break-word"
            />
          ),
        }),
        ...(catalogue.data ?? []).map((description) =>
          column.display({
            id: `role-${description.role}`,
            // Narrow, so the person's name and email keep the room
            meta: { width: "w-24 @max-xl:w-18" },
            header: () => <span className="block text-center capitalize">{description.role}</span>,
            cell: ({ row }) => (
              <span className="flex justify-center">
                <RoleBox employee={row.original} description={description} />
              </span>
            ),
          }),
        ),
      ]),
    [catalogue.data],
  );

  const table = useAppTable({
    columns,
    data: employees.data ?? loading,
    getRowId: (employee) => employee.id,
    // Staff are few: one page, by email
    manualPagination: true,
    initialState: { sorting: [{ id: "email", desc: false }] },
  });

  const refused = changing.error
    ? apiFailureMessages(
        changing.error,
        "We couldn’t change that role. Try again.",
        (field) => field,
      )[0]
    : undefined;

  return (
    <RoleChanges
      value={{
        manage,
        pending: changing.isPending ? changing.variables : undefined,
        change: (change) => changing.mutate(change),
      }}
    >
      <table.AppTable>
        <ListScreen
          title="People"
          lead="Everyone who has signed in, and the roles that decide what they can do. A change applies from their next request."
          status={read ? load.status : undefined}
          notices={
            <>
              {read && !manage && (
                <Banner tone="info" layout="strip" inset="card">
                  You can see everyone’s roles, but not give them or take them away.
                </Banner>
              )}
              {refused && (
                <Banner tone="error" layout="strip" inset="card">
                  {refused}
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
              empty={{
                title: "Nobody has signed in yet",
                description: "People appear here after their first sign-in.",
              }}
            />
          )}
        </ListScreen>
      </table.AppTable>
    </RoleChanges>
  );
}
