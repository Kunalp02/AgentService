
import React from 'react';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Wrench,
  Database,
  Bot,
  Terminal,
  Activity,
  Network,
  Cpu,
  FolderGit2,
  Lock,
  Boxes
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { RolePermissionKey } from '../../types';
import { PERMISSIONS } from '../../config/permissions';
import { useGetAgentsQuery } from '../../store/agentApi';
export const Sidebar: React.FC = () => {
  const {
     theme,
    setTheme,
  activeView,
  setActiveView,
  pendingRegistrations,
  localTools,
  knowledgeBases,
  hasPermission,
  currentRole,
  currentUser,
  canAccessView,   // <-- this was missing, causing the ReferenceError / blank screen
} = usePlatform();
  const canViewAgents = hasPermission(PERMISSIONS.Agent.View);
  const { data: agentSummary } = useGetAgentsQuery(
    { page: 1, pageSize: 1 },
    { skip: !canViewAgents },
  );
  const agentCount = agentSummary?.totalCount ?? 0;

  const pendingToolsCount = localTools.filter((t) => String(t.status || '').toLowerCase() === 'pendingapproval').length;

  interface NavItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    permission?: RolePermissionKey;
    badge?: number | string;
    badgeColor?: string;
  }

  const navSections: { section: string; items: NavItem[] }[] = [
    {
      section: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Platform Dashboard', icon: LayoutDashboard },
                { id: 'audit', label: 'Audit & Telemetry', icon: Activity },
      ],
    },
    {
      section: 'IDENTITY & GOVERNANCE',
      items: [
        {
          id: 'users',
          label: 'Users & Approvals',
          icon: Users,
          permission: PERMISSIONS.Users.View,
          badge: pendingRegistrations.length > 0 ? pendingRegistrations.length : undefined,
          badgeColor: 'bg-amber-500 text-slate-950',
        },
        {
          id: 'roles',
          label: 'Role Profiles (RBAC)',
          icon: ShieldCheck,
          permission: PERMISSIONS.RoleProfile.View,
        },
      ],
    },
    {
      section: 'INFRASTRUCTURE & TOOLS',
      items: [
        {
          id: 'tools',
          label: 'Tools Management',
          icon: Wrench,
          permission: PERMISSIONS.LocalTools.View,
          badge: pendingToolsCount > 0 ? `${pendingToolsCount} review` : undefined,
          badgeColor: 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40',
        },
        {
          id: 'model-registry',
          label: 'Model Registry',
          icon: Boxes,
          permission: PERMISSIONS.ModelRegistry.View,
          badgeColor: 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40',
        },
        {
          id: 'knowledge',
          label: 'Knowledge & RAG',
          icon: Database,
          permission: PERMISSIONS.KnowledgeBase.View,
          badge: knowledgeBases.length,
          badgeColor: 'bg-emerald-500/20 text-emerald-300',
        },
      ],
    },
    {
      section: 'INTELLIGENCE & TESTING',
      items: [
        {
          id: 'agents',
          label: 'Agent Studio',
          icon: Bot,
          permission: PERMISSIONS.Agent.View,
          badge: agentCount,
          badgeColor: 'bg-purple-500/20 text-purple-300',
        },
        {
          id: 'playground',
          label: 'Playground & Sandbox',
          icon: Terminal,
        },
      ],
    },
  ];

  return (
    <aside id="platform-sidebar" className={`w-64 m-4 mr-0 rounded-2xl border flex flex-col justify-between shrink-0 select-none ${theme === 'light' ? 'text-slate-800 backdrop-blur-lg bg-slate-950/5 border-neutral-900/5' : 'text-slate-100 backdrop-blur-lg bg-slate-100/5 border-neutral-100/10'}`}>
      <div className="py-4 px-3 space-y-6 overflow-y-auto">
{navSections.map((sec) => {
  const visibleItems = sec.items.filter((item) => canAccessView(item.id));
  if (visibleItems.length === 0) return null; // hide the whole section header too if nothing in it is visible

  return (
    <div key={sec.section} className="space-y-1">
      <div className={`px-3 text-[10px] font-bold uppercase tracking-wider mb-2 ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
        {sec.section}
      </div>
      <div className="space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              id={`nav-btn-${item.id}`}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                isActive ? 'bg-active text-white font-semibold shadow-md shadow-sky-600/25' : 'text-white hover:text-white hover:bg-sky-600/10'}`}
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0`} />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.badgeColor || 'bg-slate-700 text-slate-300'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
})}
      </div>

      {/* Role Profile summary in sidebar footer */}
      <div className="p-3">
        <div className={`px-2 py-2 rounded-lg bg-slate-850/60 border flex items-center justify-between ${theme === 'light' ? 'border-slate-400/40' : 'border-slate-300/20'}`}>
          <div className="min-w-0">
            <div className={`text-[10px] font-medium ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>Active Policy Profile</div>
            <div className={`text-xs font-bold truncate ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>{currentRole?.name || 'Standard User'}</div>
          </div>
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: currentRole?.color || '#0284c7' }}
            title={`Role code: ${currentRole?.code}`}
          />
        </div>
        <div className='text-xs flex items-center justify-center mt-2'>
          Powered by
          <span className='ml-2 px-1.5 py-0.5 rounded bg-slate-700/70 text-[10px] font-semibold tracking-wide'>CCIL</span>
        </div>
      </div>
    </aside>
  );
};
