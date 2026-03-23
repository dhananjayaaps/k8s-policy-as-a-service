'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  Shield,
  ShieldOff,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  Save,
  Eye,
  EyeOff,
  Search,
  RefreshCw,
  UserCheck,
  UserX,
  Crown,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAllUsers, addUser, deleteUser, adminUpdateUser } from '../lib/api';
import type { User } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

type Msg = { type: 'success' | 'error'; text: string };

type EditForm = {
  full_name: string;
  email: string;
  role: 'admin' | 'user';
  is_active: boolean;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      Inactive
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
      <Crown className="w-3 h-3" />
      Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
      <UserIcon className="w-3 h-3" />
      User
    </span>
  );
}

function MsgBanner({ msg }: { msg: Msg }) {
  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
      msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
    }`}>
      {msg.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
      {msg.text}
    </div>
  );
}

// ─── Add User Modal ─────────────────────────────────────────────────────────

function AddUserModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setMsg({ type: 'error', text: 'Username and password are required.' });
      return;
    }
    if (password.length < 6) {
      setMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    const res = await addUser({
      username: username.trim(),
      password,
      role,
      email: email.trim() || undefined,
      full_name: fullName.trim() || undefined,
    });
    if (res.data) {
      setMsg({ type: 'success', text: `User "${username}" created successfully.` });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } else {
      setMsg({ type: 'error', text: res.error || 'Failed to create user.' });
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Plus className="w-5 h-5 text-emerald-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Add New User</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                placeholder="e.g. john.doe"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Min. 6 characters"
                  className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
              <div className="flex gap-3">
                {(['user', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      role === r
                        ? r === 'admin'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {r === 'admin' ? <Crown className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                    {r === 'admin' ? 'Administrator' : 'Regular User'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {msg && <MsgBanner msg={msg} />}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit User Modal ─────────────────────────────────────────────────────────

function EditUserModal({
  user: target,
  currentUserId,
  onClose,
  onSuccess,
}: {
  user: User;
  currentUserId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<EditForm>({
    full_name: target.full_name || '',
    email: target.email || '',
    role: target.role,
    is_active: target.is_active,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const isSelf = target.id === currentUserId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await adminUpdateUser(target.id, {
      full_name: form.full_name.trim() || undefined,
      email: form.email.trim() || undefined,
      role: form.role,
      is_active: form.is_active,
    });
    if (res.data) {
      setMsg({ type: 'success', text: 'User updated successfully.' });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } else {
      setMsg({ type: 'error', text: res.error || 'Failed to update user.' });
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <Edit2 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Edit User</h2>
              <p className="text-xs text-slate-500">@{target.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
              <div className="flex gap-3">
                {(['user', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={isSelf}
                    onClick={() => setForm({ ...form, role: r })}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      form.role === r
                        ? r === 'admin'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {r === 'admin' ? <Crown className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                    {r === 'admin' ? 'Administrator' : 'Regular User'}
                  </button>
                ))}
              </div>
              {isSelf && <p className="text-xs text-slate-400 mt-1">You cannot change your own role.</p>}
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Account Status</label>
              <div className="flex gap-3">
                {[true, false].map((active) => (
                  <button
                    key={String(active)}
                    type="button"
                    disabled={isSelf}
                    onClick={() => setForm({ ...form, is_active: active })}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      form.is_active === active
                        ? active
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-400 bg-slate-50 text-slate-600'
                        : 'border-slate-200 text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    {active ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                    {active ? 'Active' : 'Inactive'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {msg && <MsgBanner msg={msg} />}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirmation Modal ───────────────────────────────────────────────

function DeleteConfirmModal({
  user: target,
  onClose,
  onSuccess,
}: {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  async function handleDelete() {
    setLoading(true);
    setMsg(null);
    const res = await deleteUser(target.id);
    if (res.status === 204 || res.data !== undefined) {
      onSuccess();
      onClose();
    } else {
      setMsg({ type: 'error', text: res.error || 'Failed to delete user.' });
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Delete User</h2>
              <p className="text-sm text-slate-500">This action cannot be undone.</p>
            </div>
          </div>
          <p className="text-sm text-slate-700 mb-6">
            Are you sure you want to permanently delete{' '}
            <span className="font-semibold">@{target.username}</span>
            {target.full_name ? ` (${target.full_name})` : ''}? All associated data will be removed.
          </p>
          {msg && <div className="mb-4"><MsgBanner msg={msg} /></div>}
          <div className="flex gap-3 justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function UserManagement() {
  const { user: currentUser, token } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const [actionMsg, setActionMsg] = useState<Msg | null>(null);

  const loadUsers = useCallback(async (showRefreshSpinner = false) => {
    if (!token) return;
    if (showRefreshSpinner) setRefreshing(true);
    else setLoading(true);
    const res = await getAllUsers(token);
    if (res.data) setUsers(res.data);
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => {
    if (isAdmin) loadUsers();
    else setLoading(false);
  }, [isAdmin, loadUsers]);

  async function handleToggleRole(user: User) {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    const res = await adminUpdateUser(user.id, { role: newRole });
    if (res.data) {
      setActionMsg({ type: 'success', text: `${user.username} is now ${newRole === 'admin' ? 'an Administrator' : 'a regular User'}.` });
      await loadUsers();
      setTimeout(() => setActionMsg(null), 3000);
    } else {
      setActionMsg({ type: 'error', text: res.error || 'Failed to change role.' });
      setTimeout(() => setActionMsg(null), 4000);
    }
  }

  async function handleToggleActive(user: User) {
    const res = await adminUpdateUser(user.id, { is_active: !user.is_active });
    if (res.data) {
      setActionMsg({ type: 'success', text: `${user.username} has been ${!user.is_active ? 'activated' : 'deactivated'}.` });
      await loadUsers();
      setTimeout(() => setActionMsg(null), 3000);
    } else {
      setActionMsg({ type: 'error', text: res.error || 'Failed to update status.' });
      setTimeout(() => setActionMsg(null), 4000);
    }
  }

  // Filtered list
  const filtered = users.filter((u) => {
    const matchSearch =
      !search.trim() ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && u.is_active) ||
      (statusFilter === 'inactive' && !u.is_active);
    return matchSearch && matchRole && matchStatus;
  });

  // Stats
  const totalUsers = users.length;
  const totalAdmins = users.filter((u) => u.role === 'admin').length;
  const totalActive = users.filter((u) => u.is_active).length;
  const totalInactive = users.filter((u) => !u.is_active).length;

  // Not admin guard
  if (!isAdmin) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Access Restricted</h2>
          <p className="text-slate-500 text-sm">Only administrators can manage users.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-500 text-sm mt-1">Manage system users, roles, and permissions</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadUsers(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Users', value: totalUsers, icon: <Users className="w-5 h-5 text-slate-600" />, bg: 'bg-slate-100' },
          { label: 'Administrators', value: totalAdmins, icon: <Crown className="w-5 h-5 text-purple-600" />, bg: 'bg-purple-100' },
          { label: 'Active', value: totalActive, icon: <UserCheck className="w-5 h-5 text-emerald-600" />, bg: 'bg-emerald-100' },
          { label: 'Inactive', value: totalInactive, icon: <UserX className="w-5 h-5 text-slate-500" />, bg: 'bg-slate-100' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4">
            <div className={`w-10 h-10 ${stat.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
              {stat.icon}
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
              <div className="text-xs text-slate-500">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className="mb-4">
          <MsgBanner msg={actionMsg} />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-100 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by username, name or email…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
            />
          </div>

          {/* Role filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-sm">
            {(['all', 'admin', 'user'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors capitalize ${
                  roleFilter === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {r === 'all' ? 'All Roles' : r === 'admin' ? 'Admins' : 'Users'}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-sm">
            {(['all', 'active', 'inactive'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors capitalize ${
                  statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-400 ml-auto whitespace-nowrap">
            {filtered.length} of {totalUsers} user{totalUsers !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                    {search || roleFilter !== 'all' || statusFilter !== 'all'
                      ? 'No users match your filters.'
                      : 'No users found.'}
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${!u.is_active ? 'opacity-60' : ''}`}>
                      {/* User column */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
                            u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {(u.full_name || u.username).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 flex items-center gap-1.5">
                              {u.full_name || u.username}
                              {isSelf && (
                                <span className="text-xs font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">you</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">@{u.username}</div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 text-slate-500">{u.email || <span className="text-slate-300 italic">—</span>}</td>

                      {/* Role */}
                      <td className="px-4 py-3"><RoleBadge role={u.role} /></td>

                      {/* Status */}
                      <td className="px-4 py-3"><StatusBadge active={u.is_active} /></td>

                      {/* Created */}
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Toggle role */}
                          <button
                            title={u.role === 'admin' ? 'Revoke admin' : 'Make admin'}
                            disabled={isSelf}
                            onClick={() => handleToggleRole(u)}
                            className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                              u.role === 'admin'
                                ? 'text-purple-600 hover:bg-purple-50'
                                : 'text-slate-400 hover:bg-slate-100 hover:text-purple-600'
                            }`}
                          >
                            {u.role === 'admin' ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                          </button>

                          {/* Toggle active */}
                          <button
                            title={u.is_active ? 'Deactivate' : 'Activate'}
                            disabled={isSelf}
                            onClick={() => handleToggleActive(u)}
                            className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                              u.is_active
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-slate-400 hover:bg-slate-100 hover:text-emerald-600'
                            }`}
                          >
                            {u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>

                          {/* Edit */}
                          <button
                            title="Edit user"
                            onClick={() => setEditTarget(u)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Delete */}
                          <button
                            title="Delete user"
                            disabled={isSelf}
                            onClick={() => setDeleteTarget(u)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => loadUsers()}
        />
      )}
      {editTarget && (
        <EditUserModal
          user={editTarget}
          currentUserId={currentUser!.id}
          onClose={() => setEditTarget(null)}
          onSuccess={() => loadUsers()}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => loadUsers()}
        />
      )}
    </div>
  );
}
