import { useMemo, useState } from "react";
import { createOpenAI } from "@ai-sdk/openai";
import { WebContainer } from "@webcontainer/api";
import { CodingAgent } from "edge-pi";
import { createWebContainerRuntime } from "edge-pi-webcontainer";

const defaultPrompt =
  "Create a colorful card with a title and short description.";

const htmlTemplate = (code) => `
    <html>
      <body>
        <div id="preview-root"></div>
        <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        <script type="text/babel">
          ${code}
        </script>
      </body>
    </html>
  `;

export function App() {
  const [apiKeyInput, setApiKeyInput] = useState(
    () => window.localStorage.getItem("OPENAI_API_KEY") || "",
  );
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [generatedCode, setGeneratedCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const apiKey = apiKeyInput.trim();
  const model = useMemo(() => {
    const provider = createOpenAI({ apiKey });
    return provider("gpt-5.2-codex");
  }, [apiKey]);

  async function runAgent() {
    if (!apiKey) {
      setError("Set your OpenAI API key first.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const webcontainer = await WebContainer.boot();
      const runtime = createWebContainerRuntime(webcontainer);
      const agent = new CodingAgent({
        model,
        cwd: "/home/project",
        runtime,
      });

      const file = "/home/project/App.jsx";
      await runtime.fs.mkdir("/home/project", { recursive: true });

      const result = await agent.generate({
        prompt: `Write a single JSX code file for the app to ${file}. The code will be rendered in the following HTML template: ${htmlTemplate(
          "",
        )}. The app should do the following: ${prompt}`,
      });

      const fileContent = await runtime.fs.readFile(file, "utf-8");
      setGeneratedCode(
        typeof fileContent === "string"
          ? fileContent
          : new TextDecoder().decode(fileContent),
      );

      if (!result.text) {
        setError(
          "Agent completed without a final text response. File output was still attempted.",
        );
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 24,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <h1>edge-pi browser coding agent (Vite + WebContainer)</h1>
      <p>Set an OpenAI API key, then generate a React component in-browser.</p>
      <label
        htmlFor="openai-api-key"
        style={{ display: "block", fontWeight: 600, marginBottom: 8 }}
      >
        OpenAI API key
      </label>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          id="openai-api-key"
          type="password"
          value={apiKeyInput}
          onChange={(event) => {
            const value = event.target.value;
            setApiKeyInput(value);
            window.localStorage.setItem("OPENAI_API_KEY", value.trim());
          }}
          placeholder="sk-..."
          style={{ flex: 1 }}
        />
      </div>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={4}
        style={{ width: "100%" }}
      />
      <div style={{ marginTop: 12 }}>
        <button type="button" onClick={runAgent} disabled={loading}>
          {loading ? "Generating..." : "Generate component"}
        </button>
      </div>
      {error ? <pre style={{ color: "#b91c1c" }}>{error}</pre> : null}
      <h2>Generated component source</h2>
      <pre
        style={{
          background: "#111",
          color: "#e5e7eb",
          padding: 12,
          overflowX: "auto",
        }}
      >
        {generatedCode || "No output yet."}
      </pre>
      <h2>Rendered preview</h2>
      <GeneratedPreview code={generatedCode} />
    </main>
  );
}

function GeneratedPreview({ code }) {
  if (!code) {
    return (
      <div style={{ padding: 12, border: "1px solid #ddd" }}>
        No preview yet.
      </div>
    );
  }

  return (
    <iframe
      title="generated-preview"
      srcDoc={htmlTemplate(code)}
      style={{ width: "100%", minHeight: 260, border: "1px solid #ddd" }}
    />
  );
}
