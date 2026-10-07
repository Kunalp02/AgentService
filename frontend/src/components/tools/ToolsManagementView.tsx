
import React, { useState } from 'react';
import { Code2, Server } from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { PERMISSIONS } from '../../config/permissions';
import { ErrorBoundary } from '../layout/ErrorBoundary';
import { LocalToolsPanel } from './LocalToolsPanel';
import { RemoteToolsPanel } from './RemoteToolsPanel';

type Tab = 'local' | 'remote';

export const ToolsManagementView: React.FC = () => {
  const { hasPermission, theme } = usePlatform();
  const canLocal = hasPermission(PERMISSIONS.LocalTools.View);
  const canRemote = hasPermission(PERMISSIONS.RemoteTools.View);
  const [tab, setTab] = useState<Tab>(canLocal ? 'local' : 'remote');

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; show: boolean }[] = [
    { id: 'local', label: 'Local Python tools', icon: Code2, show: canLocal },
    { id: 'remote', label: 'Remote MCP servers', icon: Server, show: canRemote },
  ];

  return (
    <div id="tools-management-view" className={`p-5 space-y-5 max-w-7xl mx-auto overflow-hidden`}>
      <div className={`panel ${theme === 'light' ? 'backdrop-blur-sm bg-slate-950/5 border-neutral-900/5 shadow-none' : 'backdrop-blur-sm bg-slate-100/5 border-neutral-100/10'}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 ${theme === 'light' ? 'text-indigo-800' : 'text-indigo-300'}`}>Tools Service</span>
          </div>
          <h1 className={`header ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>Tools Management</h1>
          <p className={`header-disciption max-w-full ${theme === 'light' ? 'text-gray-800' : 'text-gray-200'}`}>
            Author, review and test the tools agents can call — sandboxed Python functions and remote MCP servers.
          </p>
        </div>
        <div className="flex items-center gap-2 border-b-0 self-start">
          {tabs
            .filter((t) => t.show)
            .map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                    tab === t.id ? 'border-sky-500 text-white' : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
        </div>
      </div>

      {!canLocal && !canRemote ? (
        <div className={`p-8 text-center rounded-xl border text-xs ${theme === 'light' ? 'bg-slate-900/10 border-slate-400/50 text-slate-600' : 'bg-slate-950/50 border-slate-800 text-slate-400'}`}>
          Your role profile does not grant access to local tools or remote MCP servers.
        </div>
      ) : (
        <ErrorBoundary what={tab === 'local' ? 'Local tools' : 'Remote MCP servers'} resetKey={tab}>
          {tab === 'local' && canLocal && <LocalToolsPanel />}
          {tab === 'remote' && canRemote && <RemoteToolsPanel />}
        </ErrorBoundary>
      )}
      </div>
    </div>
  );
};
