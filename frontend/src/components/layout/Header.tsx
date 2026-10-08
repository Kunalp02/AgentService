
import React, { useState } from 'react';
import {
  Shield,
  Bell,
  ChevronDown,
  LogOut,
  UserCheck,
  Building2,
  Server,
  Layers,
  Sparkles,
  ExternalLink,
  Moon,
  Sun, BrainCircuit , Sparkle, Astroid,
  Monitor
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { groupName } from '@/src/api/groupDirectory';
import { BACKEND_DISPLAY_URL } from '../../config/api';
import Logo from "../../assets/images/logo_light.svg";
import DarkLogo from "../../assets/images/logo_dark.svg";

export const Header: React.FC = () => {
  const {
    currentUser,
    currentRole,
    pendingRegistrations,
    logout,
    setActiveView,
    theme,
    setTheme,
  } = usePlatform();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotificationMenu, setShowNotificationMenu] = useState(false);

  const userGroups = currentUser?.groups
    ? Object.values(currentUser.groups)
    : [];
  const roleLabel = currentRole?.name || currentUser?.roleProfile || 'Role profile not available';

  return (
    <header id="platform-header" className={`sticky top-0 z-40 border-b panel-border backdrop-blur-sm  bg-slate-100/5 shadow-2xl ${theme === 'light' ? 'text-slate-800' : 'text-slate-100'}`}>
      <div className="flex items-center justify-between px-5 py-3">
        {/* Brand & Federation Badge */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveView('dashboard')}>
            {/* <div className="w-9 h-9 flex items-center justify-center">
              <img src={DarkLogo} alt="KRUTI AI"/>
            </div> */}
            <div>
              <div className="flex items-center space-x-2">
                <span className={`flex items-center font-bold text-3xl tracking-tight text-gradient-effect relative ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}><BrainCircuit className="w-7 h-7 mr-2 text-indigo-400" />KRUTI AI <Astroid fill='#ffffff' className="w-4 h-4 absolute right-0 top-0" style={{'marginRight' : '-10px', 'marginTop' : '-7px'}}/></span>
                
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${theme === 'light' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-indigo-950 text-indigo-300 border-indigo-700/60'} border`}>
                  ENTERPRISE
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls & User Switcher */}
        <div className="flex items-center space-x-3">
          {/* Theme Toggle */}
          {/* <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'enterprise' : 'light')}
            className={`p-1.5 rounded-lg transition-colors ${theme === 'light' ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="Toggle Theme"
          >
            {theme === 'light' ? <Sun className="w-4 h-4" /> : theme === 'dark' ? <Moon className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
          </button> */}

          {/* Pending Registrations Badge */}
          {pendingRegistrations.length > 0 && (
            <button
              id="PendingApproval-approvals-header-btn"
              onClick={() => setActiveView('users')}
              className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium ${theme === 'light'
                  ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                }`}
              title="Pending User Registration Approvals"
            >
              <UserCheck className={`w-4 h-4 ${theme === 'light' ? 'text-amber-500' : 'text-amber-400'}`} />
              <span>Pending AD Approvals</span>
              <span className={`w-5 h-5 rounded-full font-bold text-[11px] flex items-center justify-center ${theme === 'light' ? 'bg-amber-500 text-white' : 'bg-amber-500 text-slate-950'
                }`}>
                {pendingRegistrations.length}
              </span>
            </button>
          )}

          {/* User Profile / Quick Switcher */}
          {currentUser ? (
            <div className="relative">
              <button
                id="user-profile-menu-btn"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className={`flex items-center space-x-3 px-3 py-1.5 rounded-lg border transition-colors text-left ${theme === 'light' ? 'bg-white hover:bg-slate-50 border-slate-200' : 'bg-slate-800 hover:bg-slate-750 border-slate-700/80'
                  }`}
              >
                <div className={`w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold border  ${theme === 'light' ? 'border-blue-400/50 bg-blue-200/50 ' : 'border-blue-500/50 bg-blue-600/30'}`}>
                  {(currentUser.displayName || currentUser.username || '?').charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-semibold ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}`}>{currentUser.displayName || currentUser.username || 'Authenticated User'}</span>
                    {/* <span
                      className="text-[10px] px-1.5 py-0.2 rounded font-mono"
                      style={{ backgroundColor: `${currentRole?.color || '#6366f1'}20`, color: currentRole?.color || '#a5b4fc', border: `1px solid ${currentRole?.color || '#6366f1'}40` }}
                    >
                      {roleLabel}
                    </span> */}
                  </div>
                  {/* <div className={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} font-mono`}>{currentUser.username || '—'}</div> */}
                  <div className={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Role: {roleLabel}</div>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-400'}`} />
              </button>

              {/* User Dropdown */}
              {showUserMenu && (
                <div
                  id="user-menu-dropdown"
                  className={`absolute right-0 mt-0 w-72 border rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-850 border-slate-700'
                    }`}
                  style={{ backgroundColor: theme === 'light' ? '#ffffff' : '#131b2e' }}
                >
                  <div className={`px-5 py-3 border-b ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/80'}`}>
                    <div className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Authenticated via Active Directory</div>
                    <div className={`font-semibold text-sm ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}`}>{currentUser.displayName}</div>
                    <div className={`text-xs font-mono ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>{currentUser.email || '—'}</div>
                    <div className={`mt-2 flex items-start gap-1.5 text-xs text-sky-500 `}>
                      <Building2 className="w-3.5 h-3.5 mt-0.5" />
                      <div>
                        {userGroups.length > 0 ? (
                          userGroups.map((groupId, index) => (
                            <span
                              key={`${groupId}-${index}`}
                              className="block font-semibold"
                            >
                              {groupName(String(groupId))}
                            </span>
                          ))
                        ) : (
                          <span className="font-semibold">
                            No group information
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        logout();
                      }}
                      className={`text-sm p-3 flex items-center gap-1 font-medium ml-auto mr-auto cursor-pointer ${theme === 'light' ? 'text-rose-500 hover:text-rose-700' : 'text-red-400 hover:text-red-500'}`}>
                      <LogOut className="w-4 h-4 mr-2" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};
