import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SessionState {
  sessionId: string | null;
  messages: ChatMessage[];
  recipe: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
}

export const Route = createFileRoute("/admin/form-builder")({
  component: FormBuilderPage,
});

function FormBuilderPage() {
  const [session, setSession] = useState<SessionState>({
    sessionId: null,
    messages: [],
    recipe: null,
    loading: false,
    error: null,
  });
  const [input, setInput] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages]);

  const startSession = async () => {
    setSession((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`${API_URL}/form-builder/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pdfName ?? "New form" }),
      });
      const data = await res.json();
      setSession((s) => ({
        ...s,
        sessionId: data.sessionId,
        loading: false,
      }));
      return data.sessionId;
    } catch (err: any) {
      setSession((s) => ({
        ...s,
        loading: false,
        error: err.message,
      }));
      return null;
    }
  };

  const sendMessage = async (overrideSessionId?: string) => {
    const sessionId = overrideSessionId ?? session.sessionId;
    if (!sessionId || !input.trim()) return;

    const userMessage = input.trim();
    setInput("");
    setSession((s) => ({
      ...s,
      messages: [...s.messages, { role: "user", content: userMessage }],
      loading: true,
      error: null,
    }));

    try {
      // Use FormData for multipart upload (supports PDF files)
      const formData = new FormData();
      formData.append("message", userMessage);
      if (pdfFile) {
        formData.append("pdf", pdfFile);
      }

      const res = await fetch(
        `${API_URL}/form-builder/sessions/${sessionId}/messages`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      // Clear PDF after first send
      if (pdfFile) {
        setPdfFile(null);
      }

      setSession((s) => ({
        ...s,
        messages: data.messages,
        recipe: data.recipe,
        loading: false,
      }));
    } catch (err: any) {
      setSession((s) => ({
        ...s,
        loading: false,
        error: err.message,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (!session.sessionId) {
      const newSessionId = await startSession();
      if (newSessionId) {
        await sendMessage(newSessionId);
      }
    } else {
      await sendMessage();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfName(file.name);
    setPdfFile(file);
  };

  const handlePublish = async () => {
    if (!session.sessionId || !session.recipe) return;
    setPublishing(true);
    try {
      const res = await fetch(
        `${API_URL}/form-builder/sessions/${session.sessionId}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const data = await res.json();
      setPublishResult(data.message ?? "Published!");
      if (data.previewUrl) {
        setPreviewUrl(data.previewUrl);
      }
    } catch (err: any) {
      setPublishResult(`Error: ${err.message}`);
    }
    setPublishing(false);
  };

  const handleDelete = async () => {
    if (!session.sessionId) return;
    if (!confirm("Are you sure you want to delete this form?")) return;
    try {
      const res = await fetch(
        `${API_URL}/form-builder/sessions/${session.sessionId}/delete`,
        { method: "POST" },
      );
      const data = await res.json();
      setPublishResult(data.message ?? "Deleted!");
      setPreviewUrl(null);
    } catch (err: any) {
      setPublishResult(`Error: ${err.message}`);
    }
  };

  const handleExportSql = async () => {
    if (!session.sessionId) return;
    try {
      const res = await fetch(
        `${API_URL}/form-builder/sessions/${session.sessionId}/sql`,
      );
      const data = await res.json();
      if (data.sql) {
        const blob = new Blob([data.sql], { type: "text/sql" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(session.recipe as any)?.formId ?? "form"}.sql`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setSession((s) => ({ ...s, error: err.message }));
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui" }}>
      {/* Chat Panel */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #e0e0e0",
        }}
      >
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid #e0e0e0",
            background: "#f8f9fa",
          }}
        >
          <h2 style={{ margin: 0 }}>Form Builder AI</h2>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: "14px" }}>
            Upload a PDF form and I'll convert it to a digital form recipe.
          </p>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
          {session.messages.length === 0 && (
            <div
              style={{ color: "#999", textAlign: "center", marginTop: "40px" }}
            >
              <p>Upload a PDF or describe a form to get started.</p>
            </div>
          )}
          {session.messages.map((msg, i) => (
            <div
              key={i}
              style={{
                marginBottom: "12px",
                padding: "12px",
                borderRadius: "8px",
                background: msg.role === "user" ? "#e3f2fd" : "#f5f5f5",
                maxWidth: "85%",
                marginLeft: msg.role === "user" ? "auto" : "0",
                whiteSpace: "pre-wrap",
                fontSize: "14px",
              }}
            >
              <strong style={{ fontSize: "12px", color: "#666" }}>
                {msg.role === "user" ? "You" : "AI Assistant"}
              </strong>
              <div style={{ marginTop: "4px" }}>{msg.content}</div>
            </div>
          ))}
          {session.loading && (
            <div style={{ color: "#666", fontStyle: "italic" }}>
              Thinking...
            </div>
          )}
          {session.error && (
            <div style={{ color: "red", padding: "8px" }}>
              Error: {session.error}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: "16px",
            borderTop: "1px solid #e0e0e0",
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <label
            style={{
              cursor: "pointer",
              padding: "8px 12px",
              background: pdfFile ? "#4caf50" : "#e0e0e0",
              borderRadius: "4px",
              fontSize: "14px",
              color: pdfFile ? "white" : "#333",
            }}
          >
            {pdfFile ? `✓ ${pdfName}` : "📎 PDF"}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe the form or ask a question..."
            style={{
              flex: 1,
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              fontSize: "14px",
            }}
            disabled={session.loading}
          />
          <button
            type="submit"
            disabled={session.loading || !input.trim()}
            style={{
              padding: "10px 20px",
              background: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Send
          </button>
        </form>
      </div>

      {/* Recipe / Preview Panel */}
      <div
        style={{
          width: "450px",
          display: "flex",
          flexDirection: "column",
          background: "#fafafa",
        }}
      >
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid #e0e0e0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3 style={{ margin: 0 }}>Recipe Output</h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleExportSql}
              disabled={!session.recipe}
              style={{
                padding: "6px 12px",
                background: session.recipe ? "#ff9800" : "#e0e0e0",
                color: session.recipe ? "white" : "#999",
                border: "none",
                borderRadius: "4px",
                cursor: session.recipe ? "pointer" : "default",
                fontSize: "12px",
              }}
            >
              Export SQL
            </button>
            <button
              onClick={handlePublish}
              disabled={!session.recipe || publishing}
              style={{
                padding: "6px 12px",
                background: session.recipe ? "#4caf50" : "#e0e0e0",
                color: session.recipe ? "white" : "#999",
                border: "none",
                borderRadius: "4px",
                cursor: session.recipe ? "pointer" : "default",
                fontSize: "12px",
              }}
            >
              {publishing ? "Publishing..." : "Publish"}
            </button>
          </div>
        </div>

        {publishResult && (
          <div
            style={{
              padding: "8px 16px",
              background: publishResult.startsWith("Error")
                ? "#ffebee"
                : "#e8f5e9",
              fontSize: "13px",
            }}
          >
            {publishResult}
          </div>
        )}

        {previewUrl && (
          <div
            style={{
              padding: "8px 16px",
              background: "#e3f2fd",
              fontSize: "13px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1976d2" }}>
              🔗 Preview form
            </a>
            <button
              onClick={handleDelete}
              style={{
                padding: "4px 8px",
                background: "#f44336",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              Delete
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
          {session.recipe ? (
            <pre
              style={{
                fontSize: "11px",
                background: "#263238",
                color: "#eeffff",
                padding: "16px",
                borderRadius: "8px",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {JSON.stringify(session.recipe, null, 2)}
            </pre>
          ) : (
            <div
              style={{
                color: "#999",
                textAlign: "center",
                marginTop: "40px",
              }}
            >
              <p>Recipe will appear here once the AI generates it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
