import { ClockCounterClockwise, DotsThree, Trash } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { Button } from "../ui/button";
import { Menu } from "../ui/menu";

/**
 * What the open page itself can do, from its bar: its history, and deleting it. A Delete that can't run yet says why
 * under it, such as the pages still beneath it, rather than failing once confirmed. The entry page is the service, so
 * deleting it deletes the service.
 */
export function PageActions({
  pageId,
  serviceId,
  entry,
  deleteBlocked,
  onDelete,
}: {
  pageId: string;
  serviceId: string;
  /** The service's entry page. */
  entry: boolean;
  /** Why the page can't be deleted yet. */
  deleteBlocked?: string;
  onDelete: () => void;
}) {
  const reason = useId();

  return (
    <Menu.Root>
      <Menu.Trigger
        render={<Button icon={<DotsThree weight="bold" />} aria-label="More page actions" tip />}
      />
      <Menu.Content aria-label="Page actions" align="end">
        <Menu.Item
          icon={<ClockCounterClockwise />}
          render={
            <Link to="/history/$pageId" params={{ pageId }} search={{ service: serviceId }} />
          }
        >
          Page history
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item
          icon={<Trash />}
          variant="danger"
          disabled={!!deleteBlocked}
          aria-describedby={deleteBlocked ? reason : undefined}
          onClick={onDelete}
        >
          {entry ? "Delete service…" : "Delete page…"}
        </Menu.Item>
        {deleteBlocked && <Menu.Note id={reason}>{deleteBlocked}</Menu.Note>}
      </Menu.Content>
    </Menu.Root>
  );
}
