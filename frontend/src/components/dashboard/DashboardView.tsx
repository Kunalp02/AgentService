
import React from "react";
import {
  Users,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Layers,
  Activity,
} from "lucide-react";
import { usePlatform } from "../../context/PlatformContext";
import { ExecutionActivity } from "../audit/ExecutionActivity";

export const DashboardView: React.FC = () => {
  const {
    users,
    pendingRegistrations,
    groups,
    auditLogs,
    setActiveView,
    canAccessView,
    theme,
    setTheme,
  } = usePlatform();

  return (
    <div id="dashboard-view" className="p-5 space-y-5 max-w-7xl mx-auto">
      <div
        className={`flex flex-col md:flex-row md:items-center justify-between gap-4  panel ${theme === "light" ? "backdrop-blur-sm bg-slate-950/5 border-neutral-900/5 shadow-none" : "backdrop-blur-sm bg-slate-100/5 border-neutral-100/10"}`}
      >
        <div>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 ${theme === "light" ? "text-indigo-800" : "text-indigo-300"}`}
          >
            Enterprise AI Management Hub
          </span>
          <h1
            className={`header ${theme === "light" ? "text-sky-950" : "text-sky-50"}`}
          >
            Platform Observability & Orchestration
          </h1>
          <p
            className={`header-disciption ${theme === "light" ? "text-gray-800" : "text-gray-200"}`}
          >
            Live identity and governance data from the Authentication & User
            Management Service.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          onClick={() => canAccessView("users") && setActiveView("users")}
          className={`panel transition-all group ${canAccessView("users") ? "hover:border-slate-700 cursor-pointer" : "opacity-60 cursor-not-allowed"} ${theme === "light" ? "backdrop-blur-sm bg-slate-950/5 border-neutral-900/5 shadow-none" : "backdrop-blur-sm bg-slate-100/5 border-neutral-100/10"}`}
        >
          <div>
            <h3
              className={`text-sm font-bold flex items-center gap-2 ${theme === "light" ? "text-sky-950" : "text-sky-50"}`}
            >
              <Users
                className={`w-4 h-4 ${theme === "light" ? "text-indigo-600" : "text-indigo-400"} `}
              />
              Enterprise Users
            </h3>
          </div>
          {/* <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Enterprise Users</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20 transition-colors"><Users className="w-4 h-4" /></div>
          </div> */}
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${theme === "light" ? "text-gray-950" : "text-gray-50"}`}
            >
              {users.filter((u) => u.status === "Active").length}
            </span>
            <span
              className={`text-sm font-medium ${theme === "light" ? "text-emerald-600" : "text-emerald-400"}`}
            >
              Active accounts
            </span>
          </div>
          {pendingRegistrations.length > 0 ? (
            <div
              className={`mt-2 text-xs flex items-center gap-1 ${theme === "light" ? "text-amber-600" : "text-amber-400"}`}
            >
              <Clock className="w-3 h-3" />
              <span>{pendingRegistrations.length} pending admin review</span>
            </div>
          ) : (
            <div
              className={`mt-2 text-xs flex items-center gap-1 ${theme === "light" ? "text-emerald-600" : "text-emerald-400"}`}
            >
              <CheckCircle2 className={`w-3 h-3`} />
              <span>All accounts verified</span>
            </div>
          )}
        </div>

        <div
          className={`panel ${theme === "light" ? "backdrop-blur-sm bg-slate-950/5 border-neutral-900/5 shadow-none" : "backdrop-blur-sm bg-slate-100/5 border-neutral-100/10"}`}
        >
          <div>
            <h3
              className={`text-sm font-bold flex items-center gap-2 ${theme === "light" ? "text-sky-950" : "text-sky-50"}`}
            >
              <ShieldCheck
                className={`w-4 h-4  ${theme === "light" ? "text-emerald-600" : "text-emerald-400"}`}
              />
              Groups
            </h3>
          </div>
          {/* <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Groups</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400"><ShieldCheck className="w-4 h-4" /></div>
          </div> */}
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${theme === "light" ? "text-gray-950" : "text-gray-50"}`}
            >
              {groups.length}
            </span>
            <span
              className={`text-sm font-medium ${theme === "light" ? "text-emerald-600" : "text-emerald-400"}`}
            >
              Total groups
            </span>
          </div>
          <div
            className={`mt-2 text-xs  ${theme === "light" ? "text-slate-600" : "text-slate-400"}`}
          >
            {groups.filter((g) => g.isActive).length} active
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div
          className={`panel flex flex-col space-y-4 ${theme === "light" ? "backdrop-blur-sm bg-slate-950/5 border-neutral-900/5 shadow-none" : "backdrop-blur-sm bg-slate-100/5 border-neutral-100/10"}`}
        >
          <div>
            <h3
              className={`text-sm font-bold flex items-center gap-2 ${theme === "light" ? "text-sky-950" : "text-sky-50"}`}
            >
              <Layers
                className={`w-4 h-4 text-emerald-400 ${theme === "light" ? "text-emerald-600" : "text-emerald-400"}`}
              />
              Groups
            </h3>
            <p
              className={`text-xs ${theme === "light" ? "text-gray-800" : "text-gray-200"}`}
            >
              Current groups returned by the Auth service
            </p>
          </div>
          <div className="space-y-3 overflow-y-auto max-h-64 pr-1">
            {groups.length === 0 ? (
              <div className="text-xs text-slate-500">
                No groups returned by the backend.
              </div>
            ) : (
              groups.map((group) => (
                <div
                  key={group.id}
                  className={`flex items-center justify-between gap-3 p-3 rounded-xl  border  ${theme === "light" ? "bg-slate-300/8 border-slate-400/50" : "bg-slate-950/50 border-slate-800"}`}
                >
                  <div className="min-w-0">
                    <div
                      className={`text-sm font-semibold truncate ${theme === "light" ? "text-slate-800" : "text-slate-200"}`}
                    >
                      {group.name || group.id}
                    </div>
                    <div
                      className={`text-xs truncate ${theme === "light" ? "text-slate-600" : "text-slate-500"}`}
                    >
                      {group.description || "No description"}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold shrink-0 ${group.isActive ? "text-emerald-600" : "text-slate-400"}`}
                  >
                    {group.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div
          className={`lg:col-span-2 panel space-y-4 ${theme === "light" ? "backdrop-blur-sm bg-slate-950/5 border-neutral-900/5 shadow-none" : "backdrop-blur-sm bg-slate-100/5 border-neutral-100/10"}`}
        >
          <div className="flex items-center justify-between">
            <h3
              className={`text-sm font-bold flex items-center gap-2 ${theme === "light" ? "text-sky-950" : "text-sky-50"}`}
            >
              <Activity
                className={`w-4 h-4 ${theme === "light" ? "text-amber-600" : "text-amber-400"}`}
              />
              Live Governance & Audit Trail
            </h3>
            <button
              onClick={() => setActiveView("audit")}
              className="text-xs text-sky-500 hover:text-sky-600 flex items-center gap-1 font-semibold cursor-pointer"
            >
              <span>View Full Log</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {auditLogs.slice(0, 5).map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-slate-850/70 border border-slate-800 text-xs flex items-start justify-between gap-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200">
                      {log.action.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                      {log.category}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed truncate">
                    {log.details}
                  </p>
                  <div className="text-xs text-slate-300 font-mono">
                    Actor: {log.actorName} ({log.actorWindowsId})
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-bold ${log.status === "SUCCESS" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}
                  >
                    {log.status}
                  </span>
                  <div className="text-xs text-slate-300 mt-1 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ExecutionActivity />
    </div>
  );
};
