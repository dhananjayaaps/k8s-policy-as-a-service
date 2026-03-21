'use client';

import { useState, useEffect } from 'react';
import {
  User,
  Lock,
  Users,
  Shield,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  Plus,
  X,
  Edit2,
  Save,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile, changePassword, getAllUsers, addUser, deleteUser, adminUpdateUser } from '../lib/api';
import type { User as UserType } from '../types';

export default function Profile() {
  const { user, token, refreshUser } = useAuth();
  const isAdmin = user?.role === 'admin';

  // ── Profile ─────────────────────────────────────────────────────────────────
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [profileFullName, setProfileFullName] = useState(user?.full_name || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Password ─────────────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Team members (admin only) ─────────────────────────────────────────────
  const [teamMembers, setTeamMembers] = useState<UserType[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<string>('');

  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
  const [addUserSaving, setAddUserSaving] = useState(false);
  const [addUserMsg, setAddUserMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setProfileEmail(user.email || '');
      setProfileFullName(user.full_name || '');
    }
  }, [user]);

  useEffect(() => {
    if (isAdmin && token) loadTeamMembers();
  }, [isAdmin, token]);

  async function loadTeamMembers() {
    if (!token) return;
    setTeamLoading(true);
    try {
      const response = await getAllUsers(token);
      if (response.data) setTeamMembers(response.data);
    } catch {
      // ignore
    } finally {
      setTeamLoading(false);
    }
  }

  async function handleProfileSave() {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const response = await updateProfile({
        email: profileEmail || undefined,
        full_name: profileFullName || undefined,
      });
      if (response.data) {
        setProfileMsg({ type: 'success', text: 'Profile updated successfully' });
        await refreshUser();
      } else {
        setProfileMsg({ type: 'error', text: response.error || 'Failed to update profile' });
      }
    } catch {
      setProfileMsg({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setProfileSaving(false);
      setTimeout(() => setProfileMsg(null), 4000);
    }
  }

  async function handlePasswordChange() {
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }
    setPasswordSaving(true);
    setPasswordMsg(null);
    try {
      const response = await changePassword(currentPassword, newPassword);
      if (response.data?.success) {
        setPasswordMsg({ type: 'success', text: 'Password changed successfully' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordMsg({ type: 'error', text: response.error || 'Failed to change password' });
      }
    } catch {
      setPasswordMsg({ type: 'error', text: 'Failed to change password' });
    } finally {
      setPasswordSaving(false);
      setTimeout(() => setPasswordMsg(null), 4000);
    }
  }

  async function handleAddUser() {
    if (!newUsername || !newUserPassword) {
      setAddUserMsg({ type: 'error', text: 'Username and password are required' });
      return;
    }
    setAddUserSaving(true);
    setAddUserMsg(null);
    try {
      const response = await addUser({
        username: newUsername,
        password: newUserPassword,
        role: newUserRole,
        email: newUserEmail || undefined,
        full_name: newUserFullName || undefined,
      });
      if (response.data) {
        setAddUserMsg({ type: 'success', text: `User "${newUsername}" created successfully` });
        setNewUsername('');
        setNewUserPassword('');
        setNewUserEmail('');
        setNewUserFullName('');
        setNewUserRole('user');
        await loadTeamMembers();
        setTimeout(() => {
          setShowAddUserModal(false);
          setAddUserMsg(null);
        }, 1500);
      } else {
        setAddUserMsg({ type: 'error', text: response.error || 'Failed to create user' });
      }
    } catch {
      setAddUserMsg({ type: 'error', text: 'Failed to create user' });
    } finally {
      setAddUserSaving(false);
    }
  }

  async function handleDeleteUser(userId: number, username: string) {
    if (!confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) return;
    try {
      const response = await deleteUser(userId);
      if (response.status === 204 || response.data !== undefined) {
        await loadTeamMembers();
      } else {
        alert(response.error || 'Failed to delete user');
      }
    } catch {
      alert('Failed to delete user');
    }
  }

  async function handleUpdateUserRole(userId: number) {
    if (!editRole) return;
    try {
      const response = await adminUpdateUser(userId, { role: editRole });
      if (response.data) {
        setEditingUserId(null);
        setEditRole('');
        await loadTeamMembers();
      } else {
        alert(response.error || 'Failed to update user');
      }
    } catch {
      alert('Failed to update user');
    }
  }

  async function handleToggleUserActive(userId: number, currentlyActive: boolean) {
    try {
      const response = await adminUpdateUser(userId, { is_active: !currentlyActive });
      if (response.data) {
        await loadTeamMembers();
      } else {
        alert(response.error || 'Failed to update user');
      }
    } catch {
      alert('Failed to update user');
    }
  }

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    user: 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="p-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <User className="w-5 h-5 text-indigo-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">User Profile</h1>
        </div>
        <p className="text-slate-600 ml-13">Manage your account information, password, and team</p>
      </div>

      <div className="space-y-6">
        {/* ── Profile ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
              <p className="text-sm text-slate-600">Manage your account information</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input
                type="text"
                value={user?.username || ''}
                disabled
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 text-sm cursor-not-allowed"
              />
              <p className="text-xs text-slate-400 mt-1">Username cannot be changed</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
              <div className="flex items-center gap-2 h-[38px]">
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${roleColors[user?.role || 'user']}`}>
                  {user?.role === 'admin' ? 'Administrator' : 'User'}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={profileFullName}
                onChange={(e) => setProfileFullName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                placeholder="Enter your email address"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
          </div>

          {profileMsg && (
            <div className={`mt-4 flex items-center gap-2 p-3 rounded-lg text-sm ${
              profileMsg.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {profileMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {profileMsg.text}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleProfileSave}
              disabled={profileSaving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Profile
            </button>
          </div>
        </div>

        {/* ── Change Password ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Change Password</h2>
              <p className="text-sm text-slate-600">Update your account password</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="Current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showNewPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="Min. 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                placeholder="Re-enter new password"
              />
            </div>
          </div>

          {passwordMsg && (
            <div className={`mt-4 flex items-center gap-2 p-3 rounded-lg text-sm ${
              passwordMsg.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {passwordMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {passwordMsg.text}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={handlePasswordChange}
              disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {passwordSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Change Password
            </button>
          </div>
        </div>

        {/* ── Team Members (admin only) ────────────────────────────────── */}
        {isAdmin && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Team Members</h2>
                  <p className="text-sm text-slate-600">Manage user access and permissions</p>
                </div>
              </div>
              <button
                onClick={() => { setShowAddUserModal(true); setAddUserMsg(null); }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add User
              </button>
            </div>

            {teamLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="space-y-2">
                {teamMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
                        <span className="font-medium text-slate-700 text-sm">
                          {(member.full_name || member.username).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-slate-900">
                          {member.full_name || member.username}
                          {member.id === user?.id && (
                            <span className="ml-2 text-xs text-slate-400">(you)</span>
                          )}
                        </div>
                        <div className="text-sm text-slate-500">
                          {member.email || member.username}
                          {!member.is_active && (
                            <span className="ml-2 text-xs text-red-500 font-medium">Deactivated</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {editingUserId === member.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            className="px-2 py-1 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button
                            onClick={() => handleUpdateUserRole(member.id)}
                            className="p-1.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"
                            title="Save"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setEditingUserId(null); setEditRole(''); }}
                            className="p-1.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className={`px-3 py-1 text-xs font-medium rounded-full ${roleColors[member.role] || 'bg-slate-100 text-slate-700'}`}>
                            {member.role === 'admin' ? 'Admin' : 'User'}
                          </span>
                          {member.id !== user?.id && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { setEditingUserId(member.id); setEditRole(member.role); }}
                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                                title="Edit role"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleToggleUserActive(member.id, member.is_active)}
                                className={`p-1.5 rounded ${
                                  member.is_active
                                    ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'
                                    : 'text-green-500 hover:text-green-700 hover:bg-green-50'
                                }`}
                                title={member.is_active ? 'Deactivate user' : 'Activate user'}
                              >
                                {member.is_active ? <Shield className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => handleDeleteUser(member.id, member.username)}
                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                                title="Delete user"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {teamMembers.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm">No team members found</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Account Details (non-admin) ──────────────────────────────── */}
        {!isAdmin && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Account Details</h2>
                <p className="text-sm text-slate-600">Your account information</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="text-xs font-medium text-slate-500 mb-1">Account Role</div>
                <div className="text-sm font-semibold text-slate-900">
                  {user?.role === 'admin' ? 'Administrator' : 'User'}
                </div>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="text-xs font-medium text-slate-500 mb-1">Member Since</div>
                <div className="text-sm font-semibold text-slate-900">
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '-'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Add User Modal ───────────────────────────────────────────────── */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Add New User</h3>
              <button onClick={() => setShowAddUserModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username *</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="Enter username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="Min. 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={newUserFullName}
                  onChange={(e) => setNewUserFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="Enter full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'user')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {addUserMsg && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                  addUserMsg.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  {addUserMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {addUserMsg.text}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
              <button
                onClick={() => setShowAddUserModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddUser}
                disabled={addUserSaving || !newUsername || !newUserPassword}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {addUserSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
