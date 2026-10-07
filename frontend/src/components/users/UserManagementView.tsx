
import React, { useEffect, useState } from 'react';
import {
  Users,
  UserCheck,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import type {
  GroupDto,
  RoleProfileDto,
  UserListItemDto,
} from '../../types/admin';
import { PERMISSIONS } from '../../config/permissions';

type Tab = 'pending' | 'users' | 'groups';

export const UserManagementView: React.FC = () => {
  const {
    users,
    pendingRegistrations,
    usersLoading,
    usersError,
    groups,
    roles,
    groupsLoading,
    rolesLoading, theme, setTheme,
    approveUserRegistration,
    rejectUserRegistration,
    updateUserAssignments,
    getUserDetail,
    changeUserStatus,
    addGroup,
    updateGroup,
    deleteGroup,
    hasPermission,
    currentUser,
    refetchUsers,
  } = usePlatform();

  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Only offer active groups for assignment — an inactive group id gets
  // rejected by the backend ("group inactive"), so keep it out of reach here.
  const activeRoles = roles.filter((r) => r.isActive);
  const activeGroups = groups.filter((g) => g.isActive);

  const [approvingUser, setApprovingUser] = useState<UserListItemDto | null>(null);
  const [approvalRoleId, setApprovalRoleId] = useState('');
  const [approvalGroupIds, setApprovalGroupIds] = useState<string[]>([]);
  const [approvalBusy, setApprovalBusy] = useState(false);

  const [rejectingUser, setRejectingUser] = useState<UserListItemDto | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);

  const [editingUser, setEditingUser] = useState<UserListItemDto | null>(null);
  const [editingUserRoleId, setEditingUserRoleId] = useState<string | null>(null);
  const [editingUserGroupIds, setEditingUserGroupIds] = useState<string[]>([]);
  const [editingUserStatus, setEditingUserStatus] = useState('Active');
  const [editingUserBusy, setEditingUserBusy] = useState(false);
  const [editingUserLoading, setEditingUserLoading] = useState(false);

  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupDto | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupActive, setGroupActive] = useState(true);
  const [groupBusy, setGroupBusy] = useState(false);

  const canManageUsers = hasPermission(PERMISSIONS.Users.Manage);
  const canApproveUsers = hasPermission(PERMISSIONS.Users.Approve);
  const canViewUsers = hasPermission(PERMISSIONS.Users.View);
  const canAddGroups = hasPermission(PERMISSIONS.Group.Add);
  const canEditGroups = hasPermission(PERMISSIONS.Group.Edit);
  const canDeleteGroups = hasPermission(PERMISSIONS.Group.Delete);

  useEffect(() => {
    if (!canViewUsers && !canManageUsers && !canApproveUsers) {
      setActiveTab('pending');
    }
  }, [canViewUsers, canManageUsers, canApproveUsers]);

  const filteredUsers = users.filter((user) => {
    const q = searchTerm.toLowerCase();
    const haystack = [
      user.username,
      user.displayName,
      user.email,
      user.roleProfile,
      ...(user.groups ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const matchesSearch = !q || haystack.includes(q);
    const matchesStatus = statusFilter === 'ALL' || user.status === statusFilter;
    const matchesGroup = groupFilter === 'ALL' || (user.groups ?? []).includes(groupFilter);
    return matchesSearch && matchesStatus && matchesGroup;
  });

  const openApproval = (user: UserListItemDto) => {
    setApprovingUser(user);
    setApprovalRoleId(roles[0]?.id ?? '');
    setApprovalGroupIds(activeGroups[0] ? [activeGroups[0].id] : []);
  };

  const confirmApproval = async () => {
    if (!approvingUser || !approvalRoleId) return;
    setApprovalBusy(true);
    try {
      await approveUserRegistration(approvingUser.id, {
        roleProfileId: approvalRoleId,
        groupIds: approvalGroupIds,
      });
      setApprovingUser(null);
    } catch {
      // Error already surfaced via notification; keep the modal open so the
      // user can adjust the role/group selection and retry.
    } finally {
      setApprovalBusy(false);
    }
  };

  const openReject = (user: UserListItemDto) => {
    setRejectingUser(user);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectingUser || !rejectReason.trim()) return;
    setRejectBusy(true);
    try {
      await rejectUserRegistration(rejectingUser.id, { reason: rejectReason.trim() });
      setRejectingUser(null);
    } catch {
      // Keep the modal open on failure so the reason isn't lost.
    } finally {
      setRejectBusy(false);
    }
  };

  const openUserEditor = async (user: UserListItemDto) => {
    setEditingUser(user);
    setEditingUserLoading(true);
    setEditingUserRoleId(null);
    setEditingUserGroupIds([]);
    setEditingUserStatus(user.status || 'Active');

    try {
      const detail = await getUserDetail(user.id);
      setEditingUserRoleId(detail.roleProfileId);
      setEditingUserGroupIds(detail.groupIds ?? []);
      setEditingUserStatus(detail.status || 'Active');
    } catch {
      // Keep the editor open, but never pretend the placeholder values are the user's actual assignments.
    } finally {
      setEditingUserLoading(false);
    }
  };

  const saveUserEditor = async () => {
    if (!editingUser) return;
    setEditingUserBusy(true);
    try {
      await updateUserAssignments(editingUser.id, {
        roleProfileId: editingUserRoleId,
        groupIds: editingUserGroupIds,
      });
      if (editingUserStatus !== (editingUser.status || '')) {
        await changeUserStatus(editingUser.id, {
          newStatus: editingUserStatus,
        });
      }
      setEditingUser(null);
      await refetchUsers();
    } catch {
      // Error already surfaced via notification; keep the modal open.
    } finally {
      setEditingUserBusy(false);
    }
  };

  const openGroupEditor = (group?: GroupDto) => {
    setEditingGroup(group ?? null);
    setGroupName(group?.name ?? '');
    setGroupDescription(group?.description ?? '');
    setGroupActive(group?.isActive ?? true);
    setGroupModalOpen(true);
  };

  const saveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    setGroupBusy(true);
    try {
      if (editingGroup) {
        await updateGroup(editingGroup.id, {
          name: groupName.trim(),
          description: groupDescription.trim(),
          isActive: groupActive,
        });
      } else {
        await addGroup({
          name: groupName.trim(),
          description: groupDescription.trim(),
        });
      }
      setGroupModalOpen(false);
    } finally {
      setGroupBusy(false);
    }
  };

  return (
    <div id="users-management-view" className={`p-5 space-y-5 max-w-7xl mx-auto `}>
      {approvingUser && (
        <div className={`fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center p-4 bg-slate-950/80`}>
          <div className={`w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-900'}`}>
            <div className={`p-5 border-b flex items-center justify-between ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
              <div>
                <h3 className={`text-sm font-bold flex items-center gap-2 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}><ShieldCheck className={`w-4 h-4  ${theme === 'light' ? 'text-emerald-600' : 'text-emerald-400'}`} />Approve User</h3>
                <p className={`mt-1 text-xs  ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>{approvingUser.displayName || approvingUser.username}</p>
              </div>
              <button onClick={() => setApprovingUser(null)} className={` ${theme === 'light' ? 'text-slate-400 hover:text-slate-600' : 'text-slate-400 hover:text-slate-300'}`}>✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Role Profile</label>
                <select value={approvalRoleId} onChange={(e) => setApprovalRoleId(e.target.value)} className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}>
                  {activeRoles.map((role) => <option key={role.id} value={role.id}>{role.name || role.id}</option>)}
                </select>
              </div>
              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Groups</label>
                <select
                  multiple
                  value={approvalGroupIds}
                  onChange={(e) => setApprovalGroupIds([...e.target.selectedOptions].map((o) => o.value))}
                  className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}                >
                  {activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name || group.id}</option>)}
                </select>
                {activeGroups.length < groups.length && (
                  <p className={`mt-2 text-xs  ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>Inactive groups are hidden here — reactivate a group first if you need to assign it.</p>
                )}
              </div>
              <div className={`flex justify-end gap-2 pt-2 border-t ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
                <button onClick={() => setApprovingUser(null)} className={`btn-secondary`}>Cancel</button>
                <button disabled={!approvalRoleId || approvalBusy} onClick={confirmApproval} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">
                  {approvalBusy ? 'Approving…' : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rejectingUser && (
        <div className={`fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center p-4 bg-slate-950/80`}>
          <div className={`w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-900'}`}>
            <div className={`p-5 border-b flex items-center justify-between ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
              <div>
                <h3 className={`text-sm font-bold flex items-center gap-2 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}><ShieldX className="w-4 h-4 text-rose-400" /> Reject Registration</h3>
                <p className={`mt-1 text-xs  ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>{rejectingUser.displayName || rejectingUser.username}</p>
              </div>
              <button onClick={() => setRejectingUser(null)} className={` ${theme === 'light' ? 'text-slate-400 hover:text-slate-600' : 'text-slate-400 hover:text-slate-300'}`}>✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className={`p-3 rounded-lg bg-rose-500/10 border text-xs ${theme === 'light' ? 'border-rose-500/30 text-rose-600 ' : 'border-rose-500/30 text-rose-200'}`}>
                You're about to reject the registration for
                <span className="font-semibold"> {rejectingUser.displayName || rejectingUser.username || rejectingUser.id}</span>.
                This can't be undone from here — the user will need to re-register.
              </div>
              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Reason (required)</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Duplicate account request, unverified department, etc."
                  className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                  autoFocus
                />
              </div>
              <div className={`flex justify-end gap-2 pt-2 border-t ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
                <button onClick={() => setRejectingUser(null)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200`}>Cancel</button>
                <button disabled={!rejectReason.trim() || rejectBusy} onClick={confirmReject} className={`px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer ${theme === 'light' ? 'bg-rose-500 hover:bg-rose-600 text-rose-100' : 'bg-rose-600/60 hover:bg-rose-800 text-rose-300'}`}>
                  {rejectBusy ? 'Rejecting…' : 'Reject Registration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className={`fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center p-4 bg-slate-950/80`}>
          <div className={`w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-900'}`}>
            <div className={`p-5 border-b flex items-center justify-between ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
              <div>
                <h3 className={`text-sm font-bold flex items-center gap-2 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>Edit User Access</h3>
                <p className={`mt-1 text-xs  ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>{editingUser.displayName || editingUser.username}</p>
              </div>
              <button onClick={() => setEditingUser(null)} className={` ${theme === 'light' ? 'text-slate-400 hover:text-slate-600' : 'text-slate-400 hover:text-slate-300'}`}>✕</button>
            </div>
            <div className="p-5 space-y-4">
              {editingUserLoading ? (
                <div className="p-10 text-center text-xs text-slate-400">Loading this user's current role profile and groups…</div>
              ) : <>
                <div>
                  <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Role Profile</label>
                  <select value={editingUserRoleId ?? ''} onChange={(e) => setEditingUserRoleId(e.target.value || null)} className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}>
                    <option value="">No role profile</option>
                    {activeRoles.map((role) => <option key={role.id} value={role.id}>{role.name || role.id}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Groups</label>
                  <select
                    multiple
                    value={editingUserGroupIds}
                    onChange={(e) => setEditingUserGroupIds([...e.target.selectedOptions].map((o) => o.value))}
                    className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                  >
                    {activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name || group.id}</option>)}
                  </select>
                  {activeGroups.length < groups.length && (
                    <p className="text-[10px] text-slate-500 mt-1">Inactive groups are hidden here — reactivate a group first if you need to assign it.</p>
                  )}
                </div>
                <div>
                  <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Status</label>
                  <select value={editingUserStatus} onChange={(e) => setEditingUserStatus(e.target.value)} className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}>
                    <option value="PendingApproval">Pending Approval</option>
                    <option value="Active">Active</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Terminated">Terminated</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
                <div className={`flex justify-end gap-2 pt-2 border-t ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
                  <button onClick={() => setEditingUser(null)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200`}>Cancel</button>
                  <button disabled={editingUserBusy} onClick={saveUserEditor} className="px-3 py-1.5  rounded-lg btn-primary-dark text-xs w-auto font-bold disabled:opacity-50">
                    {editingUserBusy ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </>}
            </div>
          </div>
        </div>
      )}

      {groupModalOpen && (
        <div className={`fixed inset-0 z-50 backdrop-blur-sm flex items-center justify-center p-4 bg-slate-950/80`}>
          <form onSubmit={saveGroup} className={`w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-900'}`}>
            <div className={`p-5 border-b flex items-center justify-between ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
              <div>
                <h3 className={`text-sm font-bold flex items-center gap-2 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>{editingGroup ? 'Edit Group' : 'Create Group'}</h3>
              </div>
              <button onClick={() => setGroupModalOpen(false)} className={` ${theme === 'light' ? 'text-slate-400 hover:text-slate-600' : 'text-slate-400 hover:text-slate-300'}`}>✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Name</label>
                <input value={groupName} onChange={(e) => setGroupName(e.target.value)} required className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`} />
              </div>
              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Description</label>
                <textarea value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} rows={3} className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`} />
              </div>
              {editingGroup && (
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={groupActive} onChange={(e) => setGroupActive(e.target.checked)} />
                  Active
                </label>
              )}
              <div className={`flex justify-end gap-2 pt-2 border-t ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
                <button type="button" onClick={() => setGroupModalOpen(false)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200`}>Cancel</button>
                <button type="submit" disabled={groupBusy} className="px-3 py-1.5  rounded-lg btn-primary-dark text-xs w-auto font-bold disabled:opacity-50">
                  {groupBusy ? 'Saving…' : editingGroup ? 'Save Changes' : 'Create Group'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
      <div className={`panel ${theme === 'light' ? 'backdrop-blur-sm bg-slate-950/5 border-neutral-900/5 shadow-none' : 'backdrop-blur-sm bg-slate-100/5 border-neutral-100/10'}`}>
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-2">
          <div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 ${theme === 'light' ? 'text-indigo-800' : 'text-indigo-300'}`}>
              Identity & Governance
            </span>
            <h1 className={`header ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>Users, Roles & Groups</h1>
            <p className={`header-disciption max-w-full ${theme === 'light' ? 'text-gray-800' : 'text-gray-200'}`}>
              Live data from the Authentication & User Management Service. No local user, role, or group records are used.
            </p>
          </div>

          <div className={`flex items-center gap-1 p-1 rounded-xl border ${theme === 'light' ? 'border-slate-300 bg-slate-100 ' : 'border-slate-700 bg-slate-900'}`}>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === 'pending' ? 'bg-amber-500 text-slate-950' : 'text-sky-400'}`}
            >
              Pending ({pendingRegistrations.length})
            </button>
            <button
              onClick={() => setActiveTab('users')}
              disabled={!canViewUsers && !canManageUsers}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === 'users' ? 'bg-sky-600 text-white' : 'text-sky-400'} disabled:opacity-40`}
            >
              Users ({users.length})
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              disabled={!canAddGroups && !canEditGroups && !canDeleteGroups}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === 'groups' ? 'bg-sky-600 text-white' : 'text-sky-400'} disabled:opacity-40`}
            >
              Groups ({groups.length})
            </button>
          </div>
        </div>

        {usersError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2  mb-2">
            <AlertCircle className="w-4 h-4" />
            <span>{usersError}</span>
          </div>
        )}

        {activeTab === 'pending' && (
          <section className="space-y-3 overflow-y-auto max-h-[calc(100vh-230px)]">

            {pendingRegistrations.length === 0 ? (
              <div className={`p-12 text-center rounded-2xl border ${theme === 'light' ? 'bg-slate-900/10 border-slate-400/50' : 'bg-slate-950/50 border-slate-800'}`}>
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-3" />
                <div className={`text-sm font-semibold truncate ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>No pending registrations</div>
                <div className={`text-xs truncate ${theme === 'light' ? 'text-slate-600' : 'text-slate-500'}`}>The backend approval queue is currently empty.</div>
              </div>
            ) : (
              pendingRegistrations.map((user) => (
                <div key={user.id} className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${theme === 'light' ? 'bg-slate-900/10 border-slate-400/50' : 'bg-slate-950/50 border-slate-800'}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <UserCheck className={`w-4 h-4 ${theme === 'light' ? 'text-amber-600' : 'text-amber-400'}`} />
                      <span className={`text-sm font-semibold ${theme === 'light' ? 'text-slate-700' : 'text-slate-200'}`}>{user.displayName || user.username || user.id}</span>
                      {currentUser?.id === user.id && <span className="text-[10px] text-indigo-300">(you)</span>}
                    </div>
                    <div className={`text-xs ${theme === 'light' ? 'text-slate-600' : 'text-slate-500'}`}>
                      {user.username || '—'} · {user.email || '—'}
                    </div>
                    <div className={`text-[10px] text-slate-500 mt-1 ${theme === 'light' ? 'text-slate-600' : 'text-slate-500'}`}>
                      Requested {new Date(user.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {canApproveUsers && (
                      <button
                        onClick={() => openApproval(user)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </button>
                    )}
                    {canManageUsers && (
                      <button
                        onClick={() => openReject(user)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${theme === 'light' ? 'bg-rose-500 hover:bg-rose-600 text-rose-100' : 'bg-rose-600/60 hover:bg-rose-800 text-rose-300'}`}>
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {activeTab === 'users' && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search username, name, email, role or group"
                  className={` ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}>
                  <option value="ALL">All statuses</option>
                  <option value="PendingApproval">Pending Approval</option>
                  <option value="Active">Active</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Terminated">Terminated</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`}>
                  <option value="ALL">All groups</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.name ?? group.id}>
                      {group.name ?? group.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {usersLoading ? (
              <div className="p-12 text-center text-xs text-slate-500">Loading users…</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-500">No users match the current filters.</div>
            ) : (
              <div className="overflow-x-auto max-h-[calc(100vh-290px)] overflow-y-auto">
                <table className={`table-class`}>
                  <thead className={`sticky top-0 ${theme === 'light' ? 'thead-light' : 'thead-dark'}`}>
                    <tr>
                      <th>User</th>
                      <th>Status</th>
                      <th>Role Profile</th>
                      <th>Groups</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody className={` ${theme === 'light' ? 'table-body-light' : 'table-body-dark'}`}>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className={`transition-colors ${theme === 'light' ? 'hover:bg-slate-200/50 border-slate-900/10' : 'hover:bg-slate-800/50 border-slate-100/10'}`}>
                        <td>
                          <div className={`text-sm font-semibold truncate ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>{user.displayName || user.username || user.id}</div>
                          <div className={`text-xs truncate ${theme === 'light' ? 'text-slate-600' : 'text-slate-500'}`}>{user.username || '—'} · {user.email || '—'}</div>
                        </td>
                        <td>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${user.status === 'Active' ? 'bg-emerald-500/20 text-emerald-600' : 'bg-amber-500/10 text-amber-300'}`}>
                            <Clock className="w-3 h-3" /> {user.status || '—'}
                          </span>
                        </td>
                        <td>{user.roleProfile || '—'}</td>
                        <td>{(user.groups ?? []).join(', ') || '—'}</td>
                        <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                        <td className="text-center">
                          {canManageUsers && (
                            <button onClick={() => openUserEditor(user)} className={`grid-btn-edit  ${theme === 'light' ? 'hover:text-sky-600 hover:bg-slate-300' : 'hover:text-sky-600 hover:bg-slate-800'}`}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab === 'groups' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-sm font-bold flex items-center gap-2 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>Groups</h2>
                <p className={`text-xs ${theme === 'light' ? 'text-gray-800' : 'text-gray-200'}`}>Only fields exposed by GroupDto are managed here.</p>
              </div>
              {canAddGroups && (
                <button onClick={() => openGroupEditor()} className="px-3 py-1.5 btn-primary-dark text-xs w-auto font-bold flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add Group
                </button>
              )}
            </div>

            {groupsLoading ? (
              <div className="p-12 text-center text-xs text-slate-500">Loading groups…</div>
            ) : groups.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-500">No groups returned by the backend.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto max-h-[calc(100vh-290px)]">
                {groups.map((group) => (
                  <div key={group.id} className={`rounded-xl  border  ${theme === 'light' ? 'bg-slate-900/10 border-slate-400/50' : 'bg-slate-950/50 border-slate-800'}`}>
                    <div className={`p-3`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={`text-sm font-semibold truncate ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>{group.name || group.id}</div>
                        </div>
                        <span className={`text-xs font-semibold shrink-0 ${group.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {group.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className={`text-xs min-h-10 ${theme === 'light' ? 'text-slate-600' : 'text-slate-500'}`}>{group.description || 'No description.'}</p>

                      <div className={`text-xs text-slate-500 mt-1 ${theme === 'light' ? 'text-slate-600' : 'text-slate-500'}`}>Created {new Date(group.createdAt).toLocaleString()}</div>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-2 border-t ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
                      {canEditGroups && (
                        <button onClick={() => openGroupEditor(group)} className={`w-full text-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200`}>
                          Edit
                        </button>
                      )}
                      {canDeleteGroups && group.isActive && (
                        <button onClick={() => deleteGroup(group.id)} className={`p-1.5 rounded-lg  ${theme === 'light' ? ' hover:text-rose-800 text-rose-600' : 'hover:text-rose-500 text-rose-300'}`} title="Delete group">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}


      </div>
    </div>
  );
};
