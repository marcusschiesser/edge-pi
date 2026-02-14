import { useMemo, useState } from "react";
import { createOpenAI } from "@ai-sdk/openai";
import { WebContainer } from "@webcontainer/api";
import { CodingAgent } from "edge-pi";
import { createWebContainerRuntime } from "edge-pi-webcontainer";

const defaultPrompt =
  "Create a React component called GeneratedCard that renders a colorful card with a title and short description.";

function extractJsx(text) {
  const codeBlockMatch = text.match(/```(?:tsx|jsx|ts|js)?\n([\s\S]*?)```/);
  return codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();
}

export function App() {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [generatedCode, setGeneratedCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const model = useMemo(() => {
    const apiKey = window.localStorage.getItem("OPENAI_API_KEY") || "";
    const provider = createOpenAI({ apiKey });
    return provider("gpt-4o-mini");
  }, []);

  async function runAgent() {
    setLoading(true);
    setError("");
    try {
      const webcontainer = await WebContainer.boot();
      const runtime = createWebContainerRuntime(webcontainer);
      const agent = new CodingAgent({
        model,
        cwd: "/home/project",
        runtime,
        toolSet: "coding",
      });

      await runtime.fs.mkdir("/home/project", { recursive: true });
      await runtime.fs.writeFile("/home/project/GeneratedCard.jsx", "export function GeneratedCard(){ return null; }", "utf-8");

      const result = await agent.generate({
        prompt: `${prompt}\n\nWrite only JSX component source for GeneratedCard to /home/project/GeneratedCard.jsx using the write tool.`,
      });

      const fileContent = await runtime.fs.readFile("/home/project/GeneratedCard.jsx", "utf-8");
      setGeneratedCode(extractJsx(typeof fileContent === "string" ? fileContent : new TextDecoder().decode(fileContent)));

      if (!result.text) {
        setError("Agent completed without a final text response. File output was still attempted.");
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "Inter, sans-serif" }}>
      <h1>edge-pi browser coding agent (Vite + WebContainer)</h1>
      <p>Set OPENAI_API_KEY in localStorage and generate a React component in-browser.</p>
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} style={{ width: "100%" }} />
      <div style={{ marginTop: 12 }}>
        <button type="button" onClick={runAgent} disabled={loading}>
          {loading ? "Generating..." : "Generate component"}
        </button>
      </div>
      {error ? <pre style={{ color: "#b91c1c" }}>{error}</pre> : null}
      <h2>Generated component source</h2>
      <pre style={{ background: "#111", color: "#e5e7eb", padding: 12, overflowX: "auto" }}>{generatedCode || "No output yet."}</pre>
      <h2>Rendered preview</h2>
      <GeneratedPreview code={generatedCode} />
    </main>
  );
}

function GeneratedPreview({ code }) {
  if (!code) {
    return <div style={{ padding: 12, border: "1px solid #ddd" }}>No preview yet.</div>;
  }

  const html = `
    <html>
      <body>
        <div id="preview-root"></div>
        <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        <script type="text/babel">
          ${code}
          const root = ReactDOM.createRoot(document.getElementById("preview-root"));
          root.render(React.createElement(GeneratedCard));
        </script>
      </body>
    </html>
  `;

  return <iframe title="generated-preview" srcDoc={html} style={{ width: "100%", minHeight: 260, border: "1px solid #ddd" }} />;
}
