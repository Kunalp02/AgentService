
import React, { useState } from 'react';
import { Shield, Key, User, Lock, Cpu, ArrowRight, Clock, AlertCircle, BrainCircuit, Sparkle, Astroid } from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import Logo from "../../assets/images/logo_light.svg";
import DarkLogo from "../../assets/images/logo_dark.svg";

export const LoginPage: React.FC = () => {
  const { login, authLoading, authError, currentUser, theme } = usePlatform();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setLocalError(null);
  setIsPendingApproval(false);
  setPendingMessage(null);

  if (!username.trim() || !password) {
    setLocalError('Please enter your username and password.');
    return;
  }

  const result = await login(username.trim(), password);
  if (!result.success) {
    if (result.isPending) {
      setIsPendingApproval(true);
      setPendingMessage(result.error ?? null);
    } else if (result.error) {
      setLocalError(result.error);
    }
  }
};


  return (
    <div className={`min-h-screen w-full flex items-center justify-center p-4 ${theme === 'light' ? 'background_light' : 'login_background_dark'}`}>
      <div
        id="login-modal"
        className={`w-full max-w-md bg-cyan-100 shadow-xl shadow-neutral-900/80 border rounded-2xl shadow-2xl overflow-hidden flex flex-col ${theme === 'light' ? 'backdrop-blur-sm bg-slate-950/5 border-neutral-900/5 shadow-none' : 'backdrop-blur-sm bg-slate-950/50 border-neutral-100/10'}`}
      >
        {/* Header */}
        <div className={`px-8 py-4 text-center ${theme === 'light' ? 'border-neutral-900/10' : 'border-neutral-100/10 '} border-b`}>
          {/* <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white ">
            <img src={DarkLogo} alt="KRUTI AI"/>
          </div> */}
          <div className='text-center'>
             <div className={`flex items-center justify-center font-bold text-4xl tracking-tight text-gradient-effect ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}><span className='relative flex items-center'><BrainCircuit className="w-7 h-7 mr-2 text-indigo-400" />KRUTI AI <Astroid fill='#ffffff' className="w-4 h-4 absolute right-0 top-0" style={{'marginRight' : '-10px', 'marginTop' : '-7px'}}/></span></div>
            <p className={`text-sm ${theme === 'light' ? 'text-gray-800' : 'text-gray-200'}`}>
              Sign in with your corporate account
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          {isPendingApproval || (currentUser && currentUser.status !== 'Active') ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                  <Clock className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-100">
                    Signed in — registration PendingApproval
                  </h4>
                  <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                    {pendingMessage || (
                      <>Your account (<code className="bg-amber-950/60 px-1 py-0.5 rounded text-amber-300 font-mono">{username}</code>) is pending administrator approval.</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              {(localError || authError) && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{localError || authError}</span>
                </div>
              )}

              <div>
                <label className={`label-dark`}>
                  Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. dchen"
                    autoComplete="username"
                    className={`${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                    required
                  />
                </div>
              </div>

              <div>
                <label className={`label-dark`}>
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    className={`${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="btn-primary-dark"
              >
                {authLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    {/* <Key className="w-4 h-4" /> */}
                    <span>Sign In</span>
                    {/* <ArrowRight className="w-3.5 h-3.5" /> */}
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
