
import React, { useState } from "react";
import { AlertTriangle, Bot } from "lucide-react";
import { usePlatform } from "../../context/PlatformContext";
import {
  executionApi,
  ExecutionApiError,
  formatExecutionTrace,
} from "../../api/execution";

export const PlaygroundView: React.FC = () => {
  const { agents, selectedPlaygroundAgentId, setSelectedPlaygroundAgentId } =
    usePlatform();
  const active =
    agents.find((a) => a.id === selectedPlaygroundAgentId) || agents[0];
  const [message, setMessage] = useState("");
  const [threadId, setThreadId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [turns, setTurns] = useState<
    { role: "user" | "agent"; text: string }[]
  >([]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !message.trim() || busy) return;
    const text = message.trim();
    setMessage("");
    setNotice("");
    setBusy(true);
    setTurns((prev) => [...prev, { role: "user", text }]);
    try {
      const result = await executionApi.sendTestMessage(
        active.id,
        text,
        threadId || null,
      );
      setThreadId(result.threadId);
      const trace = formatExecutionTrace(result.traces, result.llmCall);
      const answer = result.error || result.output || "(no output)";
      setTurns((prev) => [
        ...prev,
        { role: "agent", text: trace ? `${answer}\n\n${trace}` : answer },
      ]);
    } catch (err) {
      const trace =
        err instanceof ExecutionApiError
          ? formatExecutionTrace(err.traces, err.llmCall)
          : "";
      const message = err instanceof Error ? err.message : "Test run failed.";
      setNotice(trace ? `${message}\n${trace}` : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <div className="text-xs font-semibold text-cyan-300">
          Agent execution
        </div>
        <h1 className="text-2xl font-bold text-white">Playground</h1>
        <p className="text-xs text-slate-400 mt-1">
          Sends a studio test run. The live draft is used. This chat is one test
          thread.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
        <label className="block text-xs font-semibold text-slate-300 mb-2">
          Agent
        </label>
        <select
          value={active?.id || ""}
          onChange={(e) => {
            setSelectedPlaygroundAgentId(e.target.value || null);
            setThreadId("");
            setTurns([]);
          }}
          className="w-full bg-slate-800 rounded-lg p-2 text-xs text-white"
        >
          {agents.length === 0 && (
            <option value="">No agents returned by backend</option>
          )}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.status || "unknown"})
            </option>
          ))}
        </select>
        {threadId && (
          <div className="mt-2 text-[11px] text-slate-500">
            Test thread {threadId}
          </div>
        )}
      </div>

      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 min-h-40">
        {turns.length === 0 && (
          <p className="text-xs text-slate-500">No test messages yet.</p>
        )}
        {turns.map((turn, index) => (
          <div
            key={index}
            className={`text-xs whitespace-pre-wrap ${turn.role === "user" ? "text-slate-200" : "text-cyan-100"}`}
          >
            <span className="font-semibold">
              {turn.role === "user" ? "You" : "Agent"}:{" "}
            </span>
            {turn.text}
          </div>
        ))}
      </div>

      <form
        onSubmit={send}
        className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3"
      >
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Enter a test message"
          className="w-full bg-slate-800 rounded-lg p-3 text-xs text-white"
        />
        <div className="flex gap-2">
          <button
            disabled={!active || !message.trim() || busy}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold"
          >
            {busy ? "Running…" : "Send test"}
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs"
            onClick={() => {
              setThreadId("");
              setTurns([]);
            }}
          >
            New test chat
          </button>
        </div>
      </form>

      {notice && (
        <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-200 whitespace-pre-wrap">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          {notice}
        </div>
      )}

      {active && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
          <Bot className="w-4 h-4 inline mr-2 text-cyan-400" />
          Selected: {active.name}
        </div>
      )}
    </div>
  );
};
