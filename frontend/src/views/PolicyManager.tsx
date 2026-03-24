'use client';

import { useState, useEffect } from 'react';
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  X,
  Save,
  ChevronDown,
  ChevronUp,
  FileCode,
  Search,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getPolicies, createPolicy, updatePolicyById, deletePolicyById } from '../lib/api';
import CodeEditor from '../components/PolicyEditor/CodeEditor';
import type { Policy } from '../types';

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  'security',
  'best-practices',
  'cost',
  'reliability',
  'governance',
  'networking',
  'other',
];

const SEVERITY_OPTIONS = ['low', 'medium', 'high'] as const;
type Severity = (typeof SEVERITY_OPTIONS)[number];

const SEVERITY_STYLES: Record<string, string> = {
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

const STARTER_YAML = `apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: policy-name
  annotations:
    policies.kyverno.io/title: "Policy Title"
    policies.kyverno.io/category: "Best Practices"
    policies.kyverno.io/severity: medium
    policies.kyverno.io/description: >-
      Describe what this policy enforces.
spec:
  validationFailureAction: Audit
  background: true
  rules:
  - name: rule-name
    match:
      any:
      - resources:
          kinds:
          - Pod
    validate:
      message: "Validation failed."
      pattern:
        spec:
          containers:
          - name: "*"
`;

// ── Form state ────────────────────────────────────────────────────────────────

type PolicyForm = {
  name: string;
  title: string;
  category: string;
  severity: Severity;
  description: string;
  yaml_template: string;
  parameters: string; // raw JSON string
  is_active: boolean;
};

const emptyForm = (): PolicyForm => ({
  name: '',
  title: '',
  category: 'security',
  severity: 'medium',
  description: '',
  yaml_template: STARTER_YAML,
  parameters: '',
  is_active: true,
});

function policyToForm(policy: Policy): PolicyForm {
  let paramsStr = '';
  if (policy.parameters) {
    try {
      paramsStr = JSON.stringify(policy.parameters, null, 2);
    } catch {
      paramsStr = '';
    }
  }
  return {
    name: policy.name || '',
    title: policy.title || '',
    category: policy.category || 'security',
    severity: (policy.severity as Severity) || 'medium',
    description: policy.description || '',
    yaml_template: policy.yaml_template || STARTER_YAML,
    parameters: paramsStr,
    is_active: policy.is_active,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PolicyManager() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // create/edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [form, setForm] = useState<PolicyForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showParams, setShowParams] = useState(false);
  const [yamlErrors, setYamlErrors] = useState<string[]>([]);

  // delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Policy | null>(null);
  const [deleting, setDeleting] = useState(false);

  // toggle loading
  const [togglingId, setTogglingId] = useState<string | number | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadPolicies();
  }, []);

  async function loadPolicies() {
    setLoading(true);
    const response = await getPolicies();
    if (response.data) {
      setPolicies(response.data);
    }
    setLoading(false);
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditingPolicy(null);
    setForm(emptyForm());
    setSaveMsg(null);
    setShowParams(false);
    setYamlErrors([]);
    setModalOpen(true);
  }

  function openEdit(policy: Policy) {
    setEditingPolicy(policy);
    const f = policyToForm(policy);
    setForm(f);
    setSaveMsg(null);
    setShowParams(!!f.parameters);
    setYamlErrors([]);
    setModalOpen(true);
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.name.trim()) {
      setSaveMsg({ type: 'error', text: 'Policy name is required.' });
      return;
    }
    if (!form.yaml_template.trim()) {
      setSaveMsg({ type: 'error', text: 'Policy YAML is required.' });
      return;
    }

    let parsedParams: Record<string, any> | null = null;
    if (form.parameters.trim()) {
      try {
        parsedParams = JSON.parse(form.parameters);
      } catch {
        setSaveMsg({ type: 'error', text: 'Parameters must be valid JSON.' });
        return;
      }
    }

    setSaving(true);
    setSaveMsg(null);

    const payload = {
      name: form.name.trim(),
      title: form.title.trim() || undefined,
      category: form.category || undefined,
      severity: form.severity,
      description: form.description.trim() || undefined,
      yaml_template: form.yaml_template,
      parameters: parsedParams,
      is_active: form.is_active,
    };

    try {
      const response = editingPolicy
        ? await updatePolicyById(Number(editingPolicy.id), payload)
        : await createPolicy(payload);

      if (response.data) {
        setSaveMsg({
          type: 'success',
          text: editingPolicy ? 'Policy updated.' : 'Policy created.',
        });
        await loadPolicies();
        setTimeout(() => {
          setModalOpen(false);
          setSaveMsg(null);
        }, 1200);
      } else {
        setSaveMsg({ type: 'error', text: response.error || 'Failed to save policy.' });
      }
    } catch {
      setSaveMsg({ type: 'error', text: 'Failed to save policy.' });
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await deletePolicyById(Number(deleteTarget.id));
      if (response.error && response.status !== 200) {
        alert(response.error || 'Failed to delete policy.');
      } else {
        await loadPolicies();
        setDeleteTarget(null);
      }
    } catch {
      alert('Failed to delete policy.');
    } finally {
      setDeleting(false);
    }
  }

  // ── Toggle active ─────────────────────────────────────────────────────────
  async function handleToggleActive(policy: Policy) {
    setTogglingId(policy.id);
    try {
      const response = await updatePolicyById(Number(policy.id), {
        is_active: !policy.is_active,
      });
      if (response.data) {
        setPolicies((prev) =>
          prev.map((p) =>
            p.id === policy.id ? { ...p, is_active: !p.is_active } : p
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setTogglingId(null);
    }
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = policies.filter((p) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      (p.name || '').toLowerCase().includes(q) ||
      (p.title || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q);
    const matchCategory = !filterCategory || p.category === filterCategory;
    const matchSeverity = !filterSeverity || p.severity === filterSeverity;
    const matchStatus =
      !filterStatus ||
      (filterStatus === 'active' && p.is_active) ||
      (filterStatus === 'inactive' && !p.is_active);
    return matchSearch && matchCategory && matchSeverity && matchStatus;
  });

  const totalActive = policies.filter((p) => p.is_active).length;
  const totalInactive = policies.length - totalActive;
  const allCategories = [...new Set(policies.map((p) => p.category).filter(Boolean))] as string[];

  // ── Access guard ──────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-96 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <Shield className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h2>
        <p className="text-slate-500">Policy Manager is only available to administrators.</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-violet-600" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Policy Manager</h1>
          </div>
          <p className="text-slate-600">
            Create, edit, and manage Kyverno policy templates available for deployment
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          New Policy
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          {
            label: 'Total Policies',
            value: policies.length,
            icon: FileCode,
            iconClass: 'text-slate-600',
            bgClass: 'bg-slate-100',
            valClass: 'text-slate-900',
          },
          {
            label: 'Active',
            value: totalActive,
            icon: CheckCircle,
            iconClass: 'text-emerald-600',
            bgClass: 'bg-emerald-100',
            valClass: 'text-emerald-600',
          },
          {
            label: 'Inactive',
            value: totalInactive,
            icon: XCircle,
            iconClass: 'text-slate-400',
            bgClass: 'bg-slate-100',
            valClass: 'text-slate-400',
          },
        ].map(({ label, value, icon: Icon, iconClass, bgClass, valClass }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4"
          >
            <div className={`w-10 h-10 ${bgClass} rounded-lg flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${iconClass}`} />
            </div>
            <div>
              <div className={`text-2xl font-bold ${valClass}`}>{value}</div>
              <div className="text-sm text-slate-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, title or description…"
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
        >
          <option value="">All Categories</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
        >
          <option value="">All Severities</option>
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Policy Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileCode className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium mb-1">No policies found</p>
            <p className="text-slate-400 text-sm">
              {searchQuery || filterCategory || filterSeverity || filterStatus
                ? 'Try clearing the filters'
                : 'Click "New Policy" to create your first template'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-2/5">
                  Policy
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Updated
                </th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((policy) => (
                <tr key={policy.id} className="hover:bg-slate-50 transition-colors">
                  {/* Policy name/title/description */}
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">
                      {policy.title || policy.name}
                    </div>
                    {policy.title && (
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{policy.name}</div>
                    )}
                    {policy.description && (
                      <div className="text-sm text-slate-500 mt-0.5 line-clamp-1">
                        {policy.description}
                      </div>
                    )}
                  </td>

                  {/* Category */}
                  <td className="px-4 py-4">
                    {policy.category ? (
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                        {policy.category}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-sm">—</span>
                    )}
                  </td>

                  {/* Severity */}
                  <td className="px-4 py-4">
                    {policy.severity ? (
                      <span
                        className={`px-2.5 py-1 text-xs font-semibold rounded-full uppercase ${
                          SEVERITY_STYLES[policy.severity] || 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {policy.severity}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-sm">—</span>
                    )}
                  </td>

                  {/* Status toggle */}
                  <td className="px-4 py-4">
                    <button
                      onClick={() => handleToggleActive(policy)}
                      disabled={togglingId === policy.id}
                      title={policy.is_active ? 'Click to deactivate' : 'Click to activate'}
                      className="flex items-center gap-2 group"
                    >
                      {togglingId === policy.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      ) : (
                        <div
                          className={`relative w-9 h-5 rounded-full transition-colors ${
                            policy.is_active ? 'bg-emerald-500' : 'bg-slate-200'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                              policy.is_active ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </div>
                      )}
                      <span
                        className={`text-sm font-medium ${
                          policy.is_active ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        {policy.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </button>
                  </td>

                  {/* Updated date */}
                  <td className="px-4 py-4 text-sm text-slate-500">
                    {new Date(policy.updated_at || policy.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(policy)}
                        className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                        title="Edit policy"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(policy)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete policy"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── CREATE / EDIT MODAL ──────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-8">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                  <Shield className="w-4 h-4 text-violet-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editingPolicy ? 'Edit Policy' : 'Create New Policy'}
                </h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Row 1: Name + Title */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Policy Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. disallow-latest-tag"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm font-mono"
                  />
                  <p className="text-xs text-slate-400 mt-1">Unique identifier — lowercase with hyphens</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Display Title
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Disallow Latest Tag"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                  />
                </div>
              </div>

              {/* Row 2: Category + Severity + Status */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    list="pm-category-list"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. security"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                  />
                  <datalist id="pm-category-list">
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Severity</label>
                  <select
                    value={form.severity}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, severity: e.target.value as Severity }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors w-full ${
                      form.is_active
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-slate-50 border-slate-300 text-slate-500'
                    }`}
                  >
                    {form.is_active ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    {form.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What does this policy enforce? When should it be used?"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm resize-none"
                />
              </div>

              {/* YAML Template (code editor) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Policy YAML Body <span className="text-red-500">*</span>
                  </label>
                  {yamlErrors.length > 0 ? (
                    <span className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {yamlErrors.length} issue{yamlErrors.length !== 1 ? 's' : ''}
                    </span>
                  ) : form.yaml_template.trim() ? (
                    <span className="text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Valid YAML
                    </span>
                  ) : null}
                </div>
                <CodeEditor
                  value={form.yaml_template}
                  onChange={(v) => setForm((f) => ({ ...f, yaml_template: v }))}
                  onValidate={(_valid, errors) => setYamlErrors(errors)}
                />
              </div>

              {/* Parameters — collapsible */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowParams(!showParams)}
                  className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  {showParams ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  Parameters (Advanced)
                </button>
                {showParams && (
                  <div className="mt-3">
                    <p className="text-xs text-slate-500 mb-2">
                      Optional JSON schema defining configurable parameters for this policy
                      (e.g. image registry, allowed namespaces). Used when deploying via the editor.
                    </p>
                    <textarea
                      value={form.parameters}
                      onChange={(e) => setForm((f) => ({ ...f, parameters: e.target.value }))}
                      placeholder={'{"IMAGE_REGISTRY": {"type": "string", "default": "docker.io"}}'}
                      rows={5}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm font-mono resize-y"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Save message */}
            {saveMsg && (
              <div
                className={`mx-6 mb-4 flex items-center gap-2 p-3 rounded-lg text-sm ${
                  saveMsg.type === 'success'
                    ? 'bg-green-50 text-green-800'
                    : 'bg-red-50 text-red-800'
                }`}
              >
                {saveMsg.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                )}
                {saveMsg.text}
              </div>
            )}

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {editingPolicy ? 'Save Changes' : 'Create Policy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ─────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Delete Policy</h3>
                  <p className="text-sm text-slate-500 mt-0.5">This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-slate-700 mb-2">
                Are you sure you want to delete{' '}
                <span className="font-semibold">
                  "{deleteTarget.title || deleteTarget.name}"
                </span>
                ?
              </p>
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-5">
                Policies with active deployments cannot be deleted.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Delete Policy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
