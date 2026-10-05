import { Link } from "@tanstack/react-router";

/** "← Services", above a page's header, as case-management's detail pages do. */
export function BackLink() {
  return (
    <Link
      to="/editor"
      className="mb-s inline-flex items-center gap-xxs text-caption font-bold text-blue-100 hover:text-blue-00 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-100"
    >
      ← Services
    </Link>
  );
}
