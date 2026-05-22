import "../../styles/builder.global.css";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/builder/")({
  component: BuilderLanding,
});

const cardStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: 32,
  border: "1px solid #e0e0e0",
  borderRadius: 12,
  background: "#fff",
  textDecoration: "none",
  color: "#222",
};

function BuilderLanding() {
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
          maxWidth: 900,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <header style={{ textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>Form Builder</h1>
          <p style={{ marginTop: 8, color: "#666" }}>
            Pick how you want to author this form.
          </p>
        </header>
        <div style={{ display: "flex", gap: 16 }}>
          <Link to="/builder/ui" style={cardStyle}>
            <div style={{ fontSize: 32 }}>🧱</div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Build with the UI</h2>
            <p style={{ margin: 0, color: "#666", textAlign: "center" }}>
              Drag, configure, and validate. Full control via the visual editor.
            </p>
            <span style={{ color: "#1976d2", fontWeight: 600 }}>Open UI builder →</span>
          </Link>
          <Link to="/builder/ai" style={cardStyle}>
            <div style={{ fontSize: 32 }}>🤖</div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Build with AI</h2>
            <p style={{ margin: 0, color: "#666", textAlign: "center" }}>
              Describe a form or upload a PDF — Claude turns it into a recipe.
            </p>
            <span style={{ color: "#1976d2", fontWeight: 600 }}>Open AI builder →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
