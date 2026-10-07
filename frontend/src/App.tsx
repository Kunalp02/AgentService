
import React, { useEffect } from 'react';
import { PlatformProvider, usePlatform } from './context/PlatformContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { LoginPage } from './components/auth/LoginPage';
import { DashboardView } from './components/dashboard/DashboardView';
import { UserManagementView } from './components/users/UserManagementView';
import { RoleProfileView } from './components/roles/RoleProfileView';
import { ToolsManagementView } from './components/tools/ToolsManagementView';
import { KnowledgeManagementView } from './components/knowledge/KnowledgeManagementView';
import { AgentStudioView } from './components/agents/AgentStudioView';
import { PlaygroundView } from './components/playground/PlaygroundView';
import { AuditLogsView } from './components/audit/AuditLogsView';
import { GatewayModelRegistryView } from './components/gateway/GatewayModelRegistryView';

const MainContent: React.FC = () => {
  const { activeView, isAuthenticated, theme, canAccessView, setActiveView, sessionRestoring, permissions } = usePlatform();

  const fallbackOrder = ['dashboard', 'users', 'roles', 'tools', 'knowledge', 'agents', 'model-registry', 'playground'];
  const effectiveView = canAccessView(activeView)
    ? activeView
    : fallbackOrder.find((v) => canAccessView(v)) ?? null;

  useEffect(() => {
    if (sessionRestoring || !isAuthenticated || !permissions.length) return;
    if (effectiveView && effectiveView !== activeView) setActiveView(effectiveView);
  }, [activeView, effectiveView, isAuthenticated, permissions.length, sessionRestoring, setActiveView]);

  // While we're checking the stored token, show a neutral loading state
  // instead of flashing the login page.
  if (sessionRestoring) {
    return (
      <div className={`h-screen w-screen flex items-center justify-center ${theme === 'light' ? 'bg-slate-50' : 'bg-slate-950'}`}>
        <div className="flex flex-col items-center gap-3">
          <span className="w-6 h-6 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-xs text-slate-400">Restoring session…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const renderActiveView = () => {
    if (!effectiveView) {
      return (
      <div className="p-12 text-center text-slate-400 text-sm">
        You don't have access to any configured view yet. Contact an administrator.
      </div>
    );
    }

    switch (effectiveView) {
      case 'dashboard':
        return <DashboardView />;
      case 'users':
      case 'groups':
        return <UserManagementView />;
      case 'roles':
        return <RoleProfileView />;
      case 'tools':
        return <ToolsManagementView />;
      case 'knowledge':
        return <KnowledgeManagementView />;
      case 'agents':
        return <AgentStudioView />;
      case 'playground':
        return <PlaygroundView />;
      case 'audit':
        return <AuditLogsView />;
      case 'model-registry':
        return <GatewayModelRegistryView />;
      default:
        return <DashboardView />;
    }
  };

return (
  <div
    className={`flex flex-col h-screen w-screen overflow-hidden ${
      theme === 'light' ? 'background_light' : 'background_dark'
    }`}
  >
    <Header />

    <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
      <Sidebar />

      <main className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">
        {renderActiveView()}
      </main>
    </div>
  </div>
);
};

export default function App() {
  return (
    <PlatformProvider>
      <MainContent />
    </PlatformProvider>
  );
}
