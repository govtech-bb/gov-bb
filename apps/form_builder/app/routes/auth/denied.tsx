import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/denied")({
  component: DeniedPage,
});

function DeniedPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        fontFamily: "system-ui",
        background: "#fafafa",
      }}
    >
      <div
        style={{
          maxWidth: 600,
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: 12,
          padding: 32,
        }}
      >
        <h1 style={{ marginTop: 0 }}>Access denied</h1>
        <p>
          You don't have write access to <code>govtech-bb/gov-bb</code>. Ask an
          admin to add you as a collaborator with at least <strong>Write</strong>{" "}
          permission, then sign in again.
        </p>
        <p>
          <Link to="/auth/github">Try a different account</Link>
        </p>
      </div>
    </div>
  );
}
