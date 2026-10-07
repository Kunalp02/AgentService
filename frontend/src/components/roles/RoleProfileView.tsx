
import React, { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Edit2, Trash2, Check, Lock, Layers } from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { PERMISSIONS } from '../../config/permissions';
import { RoleProfileDto } from '../../types/admin';

interface RoleFormData {
  name: string;
  description: string;
  roleAttributeIds: string[];
  isActive: boolean;
}

export const RoleProfileView: React.FC = () => {
  const { roles, roleAttributes, addRole, updateRole, deleteRole, hasPermission, showNotification, theme, setTheme } = usePlatform();

  const [selectedRole, setSelectedRole] = useState<RoleProfileDto | null>(roles[0] || null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleProfileDto | null>(null);
  const [formData, setFormData] = useState<RoleFormData>({
    name: '', description: '', roleAttributeIds: [], isActive: true,
  });
  const [savingRole, setSavingRole] = useState(false);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedRole && roles.length > 0) setSelectedRole(roles[0]);
  }, [roles, selectedRole]);

  // Keep the detail panel in sync after a role is updated elsewhere in the list.
  useEffect(() => {
    if (!selectedRole) return;
    const fresh = roles.find((r) => r.id === selectedRole.id);
    if (fresh && fresh !== selectedRole) setSelectedRole(fresh);
  }, [roles, selectedRole]);

  const canManageRoles = hasPermission(PERMISSIONS.RoleProfile.Manage);
  const orderedRoles = [...roles].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  const categories = Array.from(new Set(roleAttributes.map((a) => a.module || 'General')));

  const handleOpenCreateModal = () => {
    setEditingRole(null);
    setFormData({ name: '', description: '', roleAttributeIds: [], isActive: true });
    setIsEditModalOpen(true);
  };

  const handleOpenEditModal = (role: RoleProfileDto) => {
    setEditingRole(role);
    setFormData({
      name: role.name || '',
      description: role.description || '',
      roleAttributeIds: (role.attributes || []).map((a) => a.id),
      isActive: role.isActive,
    });
    setIsEditModalOpen(true);
  };

  const handleToggleAttribute = (attrId: string) => {
    setFormData((prev) => ({
      ...prev,
      roleAttributeIds: prev.roleAttributeIds.includes(attrId)
        ? prev.roleAttributeIds.filter((id) => id !== attrId)
        : [...prev.roleAttributeIds, attrId],
    }));
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || savingRole) return;

    setSavingRole(true);
    try {
      if (editingRole) {
        // UpdateRoleProfileRequest supports isActive; CreateRoleProfileRequest doesn't.
        await updateRole(editingRole.id, {
          name: formData.name,
          description: formData.description,
          roleAttributeIds: formData.roleAttributeIds,
          isActive: formData.isActive,
        });
      } else {
        await addRole({
          name: formData.name,
          description: formData.description,
          roleAttributeIds: formData.roleAttributeIds,
        });
      }
      setIsEditModalOpen(false);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Role profile save failed.');
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeleteRole = async (id: string) => {
    setDeletingRoleId(id);
    try {
      await deleteRole(id);
      if (selectedRole?.id === id) setSelectedRole(null);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Role profile deactivation failed.');
    } finally {
      setDeletingRoleId(null);
    }
  };

  return (
    <div id="role-profiles-view" className={`p-5 space-y-5 max-w-7xl mx-auto overflow-hidden`}>
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-900'}`}>
            <div className={`p-5 border-b flex items-center justify-between ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
              <h3 className={`text-sm font-bold flex items-center gap-2 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>{editingRole ? `Edit ${editingRole.name}` : 'Create Role Profile'}</h3>
              <button onClick={() => !savingRole && setIsEditModalOpen(false)} className={` ${theme === 'light' ? 'text-slate-400 hover:text-slate-600' : 'text-slate-400 hover:text-slate-300'}`} disabled={savingRole}>✕</button>
            </div>
            <form onSubmit={handleSaveRole} className="p-6 space-y-5 overflow-y-auto">
              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Role Name</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`} required disabled={savingRole} />
              </div>
              <div>
                <label className={`${theme === 'light' ? 'label-light' : 'label-dark'}`}>Description</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2} className={`pl-3 ${theme === 'light' ? 'input-base-light' : 'input-base-dark'}`} disabled={savingRole} />
              </div>

              {editingRole && (
                <label className={`flex items-center gap-2 ${theme === 'light' ? 'label-light' : 'label-dark'}`}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    disabled={savingRole}
                  />
                  Active — inactive role profiles can't be assigned to users
                </label>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold flex items-center gap-2 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>Attributes ({formData.roleAttributeIds.length} Selected)</span>
                  <div className="space-x-2 text-[11px]">
                    <button type="button" onClick={() => setFormData({ ...formData, roleAttributeIds: roleAttributes.map((a) => a.id) })} className="text-sky-500 hover:underline" disabled={savingRole}>Select All</button>
                    <span className="text-slate-600">|</span>
                    <button type="button" onClick={() => setFormData({ ...formData, roleAttributeIds: [] })} className="text-slate-400 hover:underline" disabled={savingRole}>Clear All</button>
                  </div>
                </div>
                <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                  {categories.map((cat) => (
                    <div key={cat} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className={`text-xs font-bold flex items-center gap-2 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>{cat}</div>
                        <div className="flex items-center gap-2 text-[10px]">
                          <button
                            type="button"
                            onClick={() => {
                              const ids = roleAttributes
                                .filter((a) => (a.module || 'General') === cat)
                                .map((a) => a.id);
                              setFormData((prev) => ({
                                ...prev,
                                roleAttributeIds: Array.from(new Set([...prev.roleAttributeIds, ...ids])),
                              }));
                            }}
                            className="text-sky-500 hover:underline"
                            disabled={savingRole}
                          >Select all</button>
                          <button
                            type="button"
                            onClick={() => {
                              const ids = new Set(roleAttributes
                                .filter((a) => (a.module || 'General') === cat)
                                .map((a) => a.id));
                              setFormData((prev) => ({
                                ...prev,
                                roleAttributeIds: prev.roleAttributeIds.filter((id) => !ids.has(id)),
                              }));
                            }}
                            className="text-slate-500 hover:text-slate-300 hover:underline"
                            disabled={savingRole}
                          >Clear</button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {roleAttributes.filter((a) => (a.module || 'General') === cat).map((attr) => {
                          const isChecked = formData.roleAttributeIds.includes(attr.id);
                          return (
                            <label key={attr.id} className={`flex items-start space-x-2.5 p-2 rounded-lg border text-xs cursor-pointer ${isChecked ? 'bg-slate-400/10 border-slate-500/40 text-slate-200' : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-850'}`}>
                              <input type="checkbox" checked={isChecked} onChange={() => handleToggleAttribute(attr.id)} className="mt-0.5 rounded border-slate-700 bg-slate-800 text-indigo-600" disabled={savingRole} />
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-200">{attr.name || attr.code || attr.description}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className={`flex justify-end gap-2 pt-2 border-t ${theme === 'light' ? 'border-slate-400/50' : 'border-slate-800'}`}>
                <button type="button" onClick={() => setIsEditModalOpen(false)} disabled={savingRole} className={`px-3 py-1.5 rounded-lg  text-xs font-semibold ${theme === 'light' ? 'bg-slate-400 hover:bg-slate-500 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}`}>Cancel</button>
                <button type="submit" disabled={savingRole} className="px-4 py-2 rounded-lg btn-primary-dark text-xs w-auto font-bold disabled:opacity-60 flex items-center gap-2">
                  {savingRole && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {savingRole ? 'Saving…' : editingRole ? 'Save Changes' : 'Create Role Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className={`panel ${theme === 'light' ? 'backdrop-blur-sm bg-slate-950/5 border-neutral-900/5 shadow-none' : 'backdrop-blur-sm bg-slate-100/5 border-neutral-100/10'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 ${theme === 'light' ? 'text-indigo-800' : 'text-indigo-300'}`}>
                Role-Based Access Control (RBAC)
              </span>
            </div>
            <h1 className={`header ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>System Role Profiles & Permission Matrix</h1>
            <p className={`header-disciption max-w-full ${theme === 'light' ? 'text-gray-800' : 'text-gray-200'}`}>Define role profiles and assign permission attributes fetched live from the Auth service.</p>
          </div>

          {canManageRoles && (
            <button onClick={handleOpenCreateModal} className="px-3 py-1.5 btn-primary-dark text-xs w-auto font-bold flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              <span>Create Role Profile</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-3">
            <div className={`text-sm font-bold flex items-center gap-2 mt-4 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>Role Profiles ({roles.length})</div>
            <div className="space-y-2.5 pr-2 overflow-y-auto max-h-[calc(100vh-275px)]">
              {orderedRoles.map((role) => {
                const isSelected = selectedRole?.id === role.id;
                return (
                  <div key={role.id} onClick={() => setSelectedRole(role)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${isSelected ? 'bg-slate-950/50 border-sky-500 shadow-xl ring-1 ring-sky-900/50' : 'bg-slate-950/20  border-slate-800 hover:border-slate-700'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className={`text-sm font-semibold truncate ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>{role.name}</h3>
                        <span className={`text-xs font-semibold shrink-0 ${role.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {role.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      {canManageRoles && (
                        <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleOpenEditModal(role)} className={`p-1.5 rounded-lg text-sky-500  ${theme === 'light' ? 'hover:text-sky-600 hover:bg-slate-300' : 'hover:text-sky-600 hover:bg-slate-800'}`}><Edit2 className="w-3.5 h-3.5" /></button>
                          {role.isActive && (
                            <button
                              onClick={() => handleDeleteRole(role.id)}
                              disabled={deletingRoleId === role.id}
                              className={`p-1 rounded-lg  ${theme === 'light' ? ' hover:text-rose-800 text-rose-600' : 'hover:text-rose-500 text-rose-300'}`}
                              title="Deactivate role profile"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <p className={`text-xs truncate ${theme === 'light' ? 'text-slate-600' : 'text-slate-500'}`}>{role.description}</p>
                    <div className={`pt-2 border-t ${theme === 'light' ? 'border-slate-400/50 text-slate-600' : 'border-slate-800 text-slate-400'} mt-2 text-xs`}>
                      {(role.attributes || []).length} / {roleAttributes.length} Permissions
                    </div>
                  </div>
                );
              })}
              {roles.length === 0 && <div className="p-6 text-center text-xs text-slate-500 rounded-xl bg-slate-900 border border-slate-800">No role profiles yet.</div>}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {selectedRole ? (
              <div className={`p-6 rounded-2xl space-y-6 ${theme === 'light' ? 'bg-slate-600/10 border-slate-800' : 'bg-slate-950/50 border-slate-800'}`}>
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">{selectedRole.name}</h2>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${selectedRole.isActive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
                        {selectedRole.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{selectedRole.description}</p>
                  </div>
                  {canManageRoles && (
                    <button onClick={() => handleOpenEditModal(selectedRole)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-200`}>
                      <Edit2 className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-slate-700' : 'text-slate-200'}`} /><span>Edit Permissions</span>
                    </button>
                  )}
                </div>

                <div className="space-y-6 pr-2 overflow-y-auto max-h-[calc(100vh-350px)]">
                  {categories.map((category) => {
                    const attrsInCategory = roleAttributes.filter((a) => (a.module || 'General') === category);
                    return (
                      <div key={category} className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <h4 className={`text-sm font-bold flex items-center gap-2 ${theme === 'light' ? 'text-sky-950' : 'text-sky-50'}`}>
                            <Layers className={`w-4 h-4 text-emerald-400 ${theme === 'light' ? 'text-emerald-600' : 'text-emerald-400'}`} /><span>{category}</span>
                          </h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {attrsInCategory.map((attr) => {
                            const isGranted = (selectedRole.attributes || []).some((a) => a.id === attr.id);
                            return (
                              <div key={attr.id} className={`p-3.5 rounded-xl border flex items-start space-x-3 ${isGranted ? 'bg-slate-850/80 border-slate-400/20 text-slate-200' : 'bg-slate-950/40 border-slate-800 text-slate-500 opacity-60'}`}>
                                <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${isGranted ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-600'}`}>
                                  {isGranted ? <Check className="w-3.5 h-3.5" /> : <Lock className="w-3 h-3" />}
                                </div>
                                <div className="min-w-0">
                                  <div className={`text-sm font-semibold truncate ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>{attr.name || attr.code || attr.description}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-400">Select a Role Profile to inspect permissions.</div>
            )}
          </div>
        </div>


      </div></div>
  );
};
