
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

const stripTrailing = (value: string) => value.replace(/\/+$/, "");
const ensurePrefix = (value: string) => {
  const v = value.trim();
  if (!v || v === "/") return "";
  return `/${v.replace(/^\/+/, "").replace(/\/+$/, "")}`;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl = stripTrailing(env.VITE_API_BASE_URL || "");
  const prefixes = {
    auth: ensurePrefix(env.VITE_AUTH_PREFIX || ""),
    tools: ensurePrefix(env.VITE_TOOLS_PREFIX || ""),
    rag: ensurePrefix(env.VITE_RAG_PREFIX || ""),
    agent: ensurePrefix(env.VITE_AGENT_PREFIX || ""),
    gateway: ensurePrefix(env.VITE_GATEWAY_PREFIX || ""),
    workflow: ensurePrefix(env.VITE_WORKFLOW_PREFIX || ""),
    ml: ensurePrefix(env.VITE_ML_PREFIX || ""),
    engine: ensurePrefix(env.VITE_ENGINE_PREFIX || ""),
    execution: ensurePrefix(env.VITE_EXECUTION_PREFIX || ""),
  };

  const serviceTargets = {
    auth: stripTrailing(env.VITE_AUTH_BASE_URL || "") || apiBaseUrl,
    tools: stripTrailing(env.VITE_TOOLS_BASE_URL || "") || apiBaseUrl,
    rag: stripTrailing(env.VITE_RAG_BASE_URL || "") || apiBaseUrl,
    agent: stripTrailing(env.VITE_AGENT_BASE_URL || "") || apiBaseUrl,
    gateway: stripTrailing(env.VITE_GATEWAY_BASE_URL || "") || apiBaseUrl,
    workflow: stripTrailing(env.VITE_WORKFLOW_BASE_URL || "") || apiBaseUrl,
    ml: stripTrailing(env.VITE_ML_BASE_URL || "") || apiBaseUrl,
    engine: stripTrailing(env.VITE_ENGINE_BASE_URL || "") || apiBaseUrl,
    execution: stripTrailing(env.VITE_EXECUTION_BASE_URL || "") || apiBaseUrl,
  };

  const proxy: Record<string, any> = {};
  (Object.keys(prefixes) as Array<keyof typeof prefixes>).forEach((service) => {
    const prefix = prefixes[service];
    const target = serviceTargets[service];
    if (!prefix || !target) return;
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    proxy[prefix] = {
      target,
      changeOrigin: true,
      rewrite: (url: string) => url.replace(new RegExp(`^${escaped}`), ""),
    };
  });

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(__dirname, ".") } },
    server: {
      hmr: process.env.DISABLE_HMR !== "true",
      watch: process.env.DISABLE_HMR === "true" ? null : {},
      proxy,
    },
  };
});
