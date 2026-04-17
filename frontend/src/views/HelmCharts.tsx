'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  X,
  Save,
  Search,
  Play,
  FileCode,
  Code2,
  ChevronDown,
  ChevronUp,
  Package,
  Layers,
  Star,
  Sparkles,
  RefreshCw,
  ArrowLeft,
  ExternalLink,
  SlidersHorizontal,
  Download,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useCluster } from '../contexts/ClusterContext';
import CodeEditor from '../components/PolicyEditor/CodeEditor';
import ValuesUIEditor from '../components/HelmEditor/ValuesUIEditor';
import HelmEditorModal from '../components/HelmEditor/HelmEditorModal';
import {
  getHelmCharts,
  createHelmChart,
  updateHelmChart,
  deleteHelmChart,
  getHelmReleases,
  uninstallHelmRelease,
  deleteHelmRelease,
} from '../lib/api';
import type { HelmChart, HelmRelease } from '../types';

// ── ArtifactHub types ─────────────────────────────────────────────────────────

type AHSecurity = {
  low: number;
  high: number;
  medium: number;
  unknown: number;
  critical: number;
};

type AHRepo = {
  name: string;
  display_name: string;
  url: string;
  organization_display_name?: string;
  verified_publisher: boolean;
  official: boolean;
  kind?: number;
};

type AHPackage = {
  package_id: string;
  name: string;
  normalized_name: string;
  description?: string;
  version: string;
  app_version?: string;
  stars?: number;
  logo_image_id?: string;
  security_report_summary?: AHSecurity;
  repository: AHRepo;
  deprecated?: boolean;
  signed?: boolean;
};

// ── ArtifactHub API ───────────────────────────────────────────────────────────

const AH_BASE = '/api/artifacthub';

async function ahRandom(): Promise<AHPackage[]> {
  try {
    const r = await fetch(`${AH_BASE}/packages/random`, {
      headers: { accept: 'application/json' },
    });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function ahSearch(q: string): Promise<AHPackage[]> {
  try {
    const params = new URLSearchParams({
      ts_query_web: q,
      sort: 'relevance',
      limit: '20',
      offset: '0',
    });
    const r = await fetch(`${AH_BASE}/packages/search?${params}`, {
      headers: { accept: 'application/json' },
    });
    if (!r.ok) return [];
    const data = await r.json();
    return data.packages ?? [];
  } catch {
    return [];
  }
}

/** Fetch real values.yaml + reconstruct Chart.yaml from ArtifactHub package detail */
async function ahFetchPackage(
  pkg: AHPackage,
): Promise<{ values: string; chartYaml: string } | null> {
  const buildChartYaml = (cy?: string | null) => {
    // If we got a real Chart.yaml from GitHub, use it directly
    if (cy && cy.trim()) return cy;
    // Otherwise build a minimal one from known metadata
    return [
      'apiVersion: v2',
      `name: ${pkg.name}`,
      `description: ${(pkg.description ?? 'A Helm chart').replace(/\n/g, ' ')}`,
      'type: application',
      `version: ${pkg.version}`,
      `appVersion: "${pkg.app_version ?? pkg.version}"`,
    ].join('\n') + '\n';
  };

  try {
    const params = new URLSearchParams({
      packageId: pkg.package_id,
      version: pkg.version,
      repo: pkg.repository.name,
      name: pkg.normalized_name,
    });
    const r = await fetch(`/api/helm-values?${params}`);
    if (r.ok) {
      const json = await r.json();
      if (json?.values) {
        return { values: json.values as string, chartYaml: buildChartYaml(json.chartYaml) };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

// ── Color palette for chart avatars ───────────────────────────────────────────

const CARD_COLORS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-orange-400 to-rose-500',
  'from-purple-500 to-fuchsia-600',
  'from-sky-500 to-blue-600',
  'from-amber-400 to-orange-500',
];

// ── Starter templates ─────────────────────────────────────────────────────────

const STARTER_CHART_YAML = `apiVersion: v2
name: my-chart
description: A Helm chart for Kubernetes
type: application
version: 0.1.0
appVersion: "1.0.0"
`;

const STARTER_VALUES_YAML = `# Default values for the chart
replicaCount: 1

image:
  repository: nginx
  pullPolicy: IfNotPresent
  tag: ""

service:
  type: ClusterIP
  port: 80

resources:
  limits:
    cpu: 100m
    memory: 128Mi
  requests:
    cpu: 100m
    memory: 128Mi
`;

// ── Form type ─────────────────────────────────────────────────────────────────

type ChartForm = {
  name: string;
  repo_url: string;
  chart_yaml: string;
  values_yaml: string;
  description: string;
  version: string;
  app_version: string;
  icon: string;
  is_active: boolean;
};

const emptyForm = (): ChartForm => ({
  name: '',
  repo_url: '',
  chart_yaml: STARTER_CHART_YAML,
  values_yaml: STARTER_VALUES_YAML,
  description: '',
  version: '0.1.0',
  app_version: '1.0.0',
  icon: '',
  is_active: true,
});

function chartToForm(chart: HelmChart): ChartForm {
  return {
    name: chart.name || '',
    repo_url: chart.repo_url || '',
    chart_yaml: chart.chart_yaml || STARTER_CHART_YAML,
    values_yaml: chart.values_yaml || STARTER_VALUES_YAML,
    description: chart.description || '',
    version: chart.version || '',
    app_version: chart.app_version || '',
    icon: chart.icon || '',
    is_active: chart.is_active,
  };
}

function pkgToForm(pkg: AHPackage): ChartForm {
  return {
    name: pkg.normalized_name || pkg.name,
    repo_url: pkg.repository.url || '',
    chart_yaml: `apiVersion: v2\nname: ${pkg.name}\ndescription: ${pkg.description || 'A Helm chart'}\ntype: application\nversion: ${pkg.version}\nappVersion: "${pkg.app_version || pkg.version}"\n`,
    values_yaml: STARTER_VALUES_YAML,
    description: pkg.description || '',
    version: pkg.version,
    app_version: pkg.app_version || pkg.version,
    icon: pkg.logo_image_id ? `https://artifacthub.io/image/${pkg.logo_image_id}` : '',
    is_active: true,
  };
}

// ── Status styles ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  deployed: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
  uninstalled: 'bg-slate-100 text-slate-500',
};

// ── SecurityBadge ─────────────────────────────────────────────────────────────

function SecurityBadge({ s }: { s: AHSecurity }) {
  const total = s.critical + s.high + s.medium + s.low + s.unknown;
  if (total === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
        <CheckCircle className="w-3 h-3" /> Clean
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {s.critical > 0 && (
        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-semibold">C:{s.critical}</span>
      )}
      {s.high > 0 && (
        <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-semibold">H:{s.high}</span>
      )}
      {s.medium > 0 && (
        <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-semibold">M:{s.medium}</span>
      )}
      {s.low > 0 && (
        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-xs">L:{s.low}</span>
      )}
    </div>
  );
}

// ── AHCard ────────────────────────────────────────────────────────────────────

function AHCard({ pkg, onSelect }: { pkg: AHPackage; onSelect: () => void }) {
  const [imgError, setImgError] = useState(false);
  const colorIdx = pkg.name.charCodeAt(0) % CARD_COLORS.length;
  const showLogo = !!pkg.logo_image_id && !imgError;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-sky-300 hover:shadow-lg transition-all group flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        {showLogo ? (
          <img
            src={`https://artifacthub.io/image/${pkg.logo_image_id}`}
            alt={pkg.name}
            className="w-11 h-11 rounded-xl object-contain bg-white border border-slate-100 flex-shrink-0 p-0.5"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className={`w-11 h-11 rounded-xl bg-gradient-to-br ${CARD_COLORS[colorIdx]} flex items-center justify-center flex-shrink-0`}
          >
            <Package className="w-5 h-5 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 text-sm truncate leading-tight">{pkg.name}</div>
          <div className="text-xs text-slate-400 truncate mt-0.5">
            {pkg.repository.organization_display_name || pkg.repository.display_name}
          </div>
        </div>
        {(pkg.stars ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-amber-500 flex-shrink-0 font-medium">
            <Star className="w-3 h-3 fill-current" />
            {pkg.stars}
          </span>
        )}
      </div>

      {/* Description */}
      {pkg.description && (
        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed flex-1">{pkg.description}</p>
      )}

      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full font-mono">{pkg.version}</span>
        {pkg.repository.verified_publisher && (
          <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full font-medium">✓ Verified</span>
        )}
        {pkg.deprecated && (
          <span className="px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-full font-medium">Deprecated</span>
        )}
      </div>

      {/* Security */}
      {pkg.security_report_summary && <SecurityBadge s={pkg.security_report_summary} />}

      {/* Select button */}
      <button
        onClick={onSelect}
        className="mt-auto w-full py-1.5 bg-sky-600 text-white text-xs font-semibold rounded-lg hover:bg-sky-700 transition-colors opacity-0 group-hover:opacity-100"
      >
        Use this chart →
      </button>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HelmCharts() {
  const { user } = useAuth();
  const { selectedClusterId } = useCluster();
  const isAdmin = user?.role === 'admin';

  // Data
  const [charts, setCharts] = useState<HelmChart[]>([]);
  const [releases, setReleases] = useState<HelmRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingReleases, setLoadingReleases] = useState(false);

  // View mode
  const [viewTab, setViewTab] = useState<'charts' | 'releases'>('charts');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Create/edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingChart, setEditingChart] = useState<HelmChart | null>(null);
  const [form, setForm] = useState<ChartForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showChartYaml, setShowChartYaml] = useState(false);

  // Deploy editor modal
  const [deployChart, setDeployChart] = useState<HelmChart | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<HelmChart | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Release actions
  const [uninstallingId, setUninstallingId] = useState<number | null>(null);
  const [deletingReleaseId, setDeletingReleaseId] = useState<number | null>(null);

  // Toggle loading
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // ── ArtifactHub marketplace (modal) ──────────────────────────────────────
  const [modalStep, setModalStep] = useState<'source' | 'browse' | 'configure'>('source');
  const [ahResults, setAhResults] = useState<AHPackage[]>([]);
  const [ahQuery, setAhQuery] = useState('');
  const [ahLoading, setAhLoading] = useState(false);
  const [selectedAHPkg, setSelectedAHPkg] = useState<AHPackage | null>(null);
  const [fetchingYaml, setFetchingYaml] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [valuesTab, setValuesTab] = useState<'code' | 'ui'>('ui');
  const [chartYamlTab, setChartYamlTab] = useState<'code' | 'ui'>('code');

  // ── Data loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    loadCharts();
  }, []);

  useEffect(() => {
    if (viewTab === 'releases') loadReleases();
  }, [viewTab, selectedClusterId]);

  async function loadCharts() {
    setLoading(true);
    const res = await getHelmCharts();
    if (res.data) setCharts(res.data);
    setLoading(false);
  }

  async function loadReleases() {
    setLoadingReleases(true);
    const opts: any = {};
    if (selectedClusterId) opts.cluster_id = Number(selectedClusterId);
    const res = await getHelmReleases(opts);
    if (res.data) setReleases(res.data);
    setLoadingReleases(false);
  }

  // ── ArtifactHub helpers ───────────────────────────────────────────────────

  const loadRandomCharts = useCallback(async () => {
    setAhLoading(true);
    const pkgs = await ahRandom();
    setAhResults(pkgs);
    setAhLoading(false);
  }, []);

  const handleAhSearch = useCallback(async (q: string) => {
    setAhLoading(true);
    const pkgs = q.trim() ? await ahSearch(q.trim()) : await ahRandom();
    setAhResults(pkgs);
    setAhLoading(false);
  }, []);

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openCreate() {
    setEditingChart(null);
    setForm(emptyForm());
    setSaveMsg(null);
    setShowChartYaml(false);
    setModalStep('source');
    setAhResults([]);
    setAhQuery('');
    setSelectedAHPkg(null);
    setFetchError(null);
    setValuesTab('ui');
    setChartYamlTab('code');
    setModalOpen(true);
  }

  function openEdit(chart: HelmChart) {
    setEditingChart(chart);
    setForm(chartToForm(chart));
    setSaveMsg(null);
    setShowChartYaml(true);
    setModalStep('configure');
    setSelectedAHPkg(null);
    setFetchError(null);
    setValuesTab('ui');
    setChartYamlTab('code');
    setModalOpen(true);
  }

  async function handleFetchFromAH() {
    if (!selectedAHPkg) return;
    setFetchingYaml(true);
    setFetchError(null);
    const result = await ahFetchPackage(selectedAHPkg);
    setFetchingYaml(false);
    if (result) {
      setForm((f) => ({ ...f, values_yaml: result.values, chart_yaml: result.chartYaml }));
      setValuesTab('ui');
    } else {
      setFetchError('Could not fetch from ArtifactHub. The chart may not publish its values.');
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim()) {
      setSaveMsg({ type: 'error', text: 'Chart name is required.' });
      return;
    }
    if (!form.chart_yaml.trim()) {
      setSaveMsg({ type: 'error', text: 'Chart.yaml content is required.' });
      return;
    }

    setSaving(true);
    setSaveMsg(null);

    const payload = {
      name: form.name.trim(),
      repo_url: form.repo_url.trim() || undefined,
      chart_yaml: form.chart_yaml,
      values_yaml: form.values_yaml || undefined,
      description: form.description.trim() || undefined,
      version: form.version.trim() || undefined,
      app_version: form.app_version.trim() || undefined,
      icon: form.icon.trim() || undefined,
      is_active: form.is_active,
    };

    try {
      const response = editingChart
        ? await updateHelmChart(editingChart.id, payload)
        : await createHelmChart(payload);

      if (response.data) {
        setSaveMsg({ type: 'success', text: editingChart ? 'Chart updated.' : 'Chart created.' });
        await loadCharts();
        setTimeout(() => {
          setModalOpen(false);
          setSaveMsg(null);
        }, 1200);
      } else {
        setSaveMsg({ type: 'error', text: response.error || 'Failed to save chart.' });
      }
    } catch {
      setSaveMsg({ type: 'error', text: 'Failed to save chart.' });
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteHelmChart(deleteTarget.id);
      if (res.error && res.status !== 200) {
        alert(res.error || 'Failed to delete chart.');
      } else {
        await loadCharts();
        setDeleteTarget(null);
      }
    } catch {
      alert('Failed to delete chart.');
    } finally {
      setDeleting(false);
    }
  }

  // ── Toggle active ─────────────────────────────────────────────────────────

  async function handleToggleActive(chart: HelmChart) {
    setTogglingId(chart.id);
    try {
      const res = await updateHelmChart(chart.id, { is_active: !chart.is_active });
      if (res.data) {
        setCharts((prev) =>
          prev.map((c) => (c.id === chart.id ? { ...c, is_active: !c.is_active } : c))
        );
      }
    } catch {
      // ignore
    } finally {
      setTogglingId(null);
    }
  }

  // ── Release actions ───────────────────────────────────────────────────────

  async function handleUninstall(releaseId: number) {
    setUninstallingId(releaseId);
    try {
      const res = await uninstallHelmRelease(releaseId);
      if (res.data?.success) await loadReleases();
      else alert(res.error || 'Failed to uninstall release.');
    } catch {
      alert('Failed to uninstall release.');
    } finally {
      setUninstallingId(null);
    }
  }

  async function handleDeleteRelease(releaseId: number) {
    setDeletingReleaseId(releaseId);
    try {
      const res = await deleteHelmRelease(releaseId);
      if (res.error && res.status !== 200) alert(res.error || 'Failed to delete release.');
      else await loadReleases();
    } catch {
      alert('Failed to delete release.');
    } finally {
      setDeletingReleaseId(null);
    }
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filteredCharts = charts.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q);
    const matchStatus =
      !filterStatus ||
      (filterStatus === 'active' && c.is_active) ||
      (filterStatus === 'inactive' && !c.is_active);
    return matchSearch && matchStatus;
  });

  const filteredReleases = releases.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      r.release_name.toLowerCase().includes(q) ||
      r.namespace.toLowerCase().includes(q);
    const matchStatus = !filterStatus || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalActive = charts.filter((c) => c.is_active).length;

  // ── Access guard ──────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-96 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <Package className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h2>
        <p className="text-slate-500">Helm Charts Manager is only available to administrators.</p>
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
            <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-sky-600" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Helm Charts</h1>
          </div>
          <p className="text-slate-600">
            Create, manage, and deploy Helm chart templates to clusters with custom values
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          New Chart
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Charts', value: charts.length, icon: Package, iconCls: 'text-slate-600', bgCls: 'bg-slate-100', valCls: 'text-slate-900' },
          { label: 'Active', value: totalActive, icon: CheckCircle, iconCls: 'text-emerald-600', bgCls: 'bg-emerald-100', valCls: 'text-emerald-600' },
          { label: 'Releases', value: releases.length, icon: Layers, iconCls: 'text-sky-600', bgCls: 'bg-sky-100', valCls: 'text-sky-600' },
        ].map(({ label, value, icon: Icon, iconCls, bgCls, valCls }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
            <div className={`w-10 h-10 ${bgCls} rounded-lg flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${iconCls}`} />
            </div>
            <div>
              <div className={`text-2xl font-bold ${valCls}`}>{value}</div>
              <div className="text-sm text-slate-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* View tabs */}
      <div className="flex border-b border-slate-200 mb-4">
        {[
          { key: 'charts' as const, label: 'Charts', icon: Package },
          { key: 'releases' as const, label: 'Releases', icon: Layers },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setViewTab(key); setSearchQuery(''); setFilterStatus(''); }}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              viewTab === key ? 'border-sky-500 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
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
            placeholder={viewTab === 'charts' ? 'Search charts…' : 'Search releases…'}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
          />
        </div>
        {viewTab === 'charts' ? (
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        ) : (
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
          >
            <option value="">All Status</option>
            <option value="deployed">Deployed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="uninstalled">Uninstalled</option>
          </select>
        )}
      </div>

      {/* ── Charts Table ─────────────────────────────────────────────────────── */}
      {viewTab === 'charts' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
            </div>
          ) : filteredCharts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Package className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium mb-1">No charts found</p>
              <p className="text-slate-400 text-sm">
                {searchQuery || filterStatus ? 'Try clearing the filters' : 'Click "New Chart" to create your first Helm chart'}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-2/5">Chart</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Version</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Updated</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCharts.map((chart) => (
                  <tr key={chart.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{chart.name}</div>
                      {chart.description && (
                        <div className="text-sm text-slate-500 mt-0.5 line-clamp-1">{chart.description}</div>
                      )}
                      {chart.repo_url && (
                        <div className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-xs">{chart.repo_url}</div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-slate-700 font-mono">{chart.version || '—'}</span>
                      {chart.app_version && (
                        <div className="text-xs text-slate-400">app: {chart.app_version}</div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => handleToggleActive(chart)}
                        disabled={togglingId === chart.id}
                        title={chart.is_active ? 'Click to deactivate' : 'Click to activate'}
                        className="flex items-center gap-2 group"
                      >
                        {togglingId === chart.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        ) : (
                          <div className={`relative w-9 h-5 rounded-full transition-colors ${chart.is_active ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${chart.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </div>
                        )}
                        <span className={`text-sm font-medium ${chart.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {chart.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500">
                      {new Date(chart.updated_at || chart.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setDeployChart(chart)}
                          className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                          title="Deploy chart"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(chart)}
                          className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                          title="Edit chart"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(chart)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete chart"
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
      )}

      {/* ── Releases Table ───────────────────────────────────────────────────── */}
      {viewTab === 'releases' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loadingReleases ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
            </div>
          ) : filteredReleases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Layers className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium mb-1">No releases found</p>
              <p className="text-slate-400 text-sm">Deploy a chart to see releases here</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Release</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Namespace</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Revision</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Deployed</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReleases.map((rel) => (
                  <tr key={rel.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 font-mono">{rel.release_name}</div>
                      <div className="text-xs text-slate-400">chart #{rel.chart_id}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                        {rel.namespace}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700 font-mono">{rel.revision}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize ${STATUS_STYLES[rel.status] || 'bg-slate-100 text-slate-600'}`}>
                        {rel.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500">
                      {rel.deployed_at
                        ? new Date(rel.deployed_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {rel.status === 'deployed' && (
                          <button
                            onClick={() => handleUninstall(rel.id)}
                            disabled={uninstallingId === rel.id}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Uninstall release"
                          >
                            {uninstallingId === rel.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        {rel.status !== 'deployed' && (
                          <button
                            onClick={() => handleDeleteRelease(rel.id)}
                            disabled={deletingReleaseId === rel.id}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete release record"
                          >
                            {deletingReleaseId === rel.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── CREATE / EDIT CHART MODAL ────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className={`bg-white rounded-2xl shadow-2xl w-full my-8 transition-all duration-200 ${modalStep === 'browse' ? 'max-w-6xl' : 'max-w-5xl'}`}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                {!editingChart && modalStep !== 'source' && (
                  <button
                    onClick={() =>
                      setModalStep(modalStep === 'configure' && selectedAHPkg ? 'browse' : 'source')
                    }
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Back"
                  >
                    <ArrowLeft className="w-4 h-4 text-slate-500" />
                  </button>
                )}
                <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
                  {modalStep === 'browse' ? (
                    <Sparkles className="w-4 h-4 text-sky-600" />
                  ) : (
                    <Package className="w-4 h-4 text-sky-600" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {editingChart
                      ? `Edit — ${editingChart.name}`
                      : modalStep === 'source'
                      ? 'Create New Helm Chart'
                      : modalStep === 'browse'
                      ? 'ArtifactHub Marketplace'
                      : selectedAHPkg
                      ? `Configure — ${selectedAHPkg.name}`
                      : 'Create from Scratch'}
                  </h2>
                  {modalStep === 'browse' && (
                    <p className="text-xs text-slate-400 mt-0.5">Select a chart to pre-fill your configuration</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* ── STEP: source ── */}
            {modalStep === 'source' && (
              <div className="p-10">
                <div className="text-center mb-10">
                  <p className="text-slate-500 text-base">How would you like to get started?</p>
                </div>
                <div className="grid grid-cols-2 gap-6 max-w-2xl mx-auto">
                  <button
                    onClick={() => {
                      setModalStep('browse');
                      loadRandomCharts();
                    }}
                    className="flex flex-col items-center gap-4 p-8 border-2 border-slate-200 rounded-2xl hover:border-sky-400 hover:bg-sky-50 transition-all text-center group"
                  >
                    <div className="w-16 h-16 bg-sky-100 rounded-2xl flex items-center justify-center group-hover:bg-sky-200 transition-colors">
                      <Sparkles className="w-8 h-8 text-sky-600" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-lg mb-1">Browse ArtifactHub</div>
                      <div className="text-sm text-slate-500 leading-relaxed">
                        Search thousands of community Helm charts and import with one click
                      </div>
                    </div>
                    <span className="px-5 py-2 bg-sky-600 text-white text-sm font-semibold rounded-full group-hover:bg-sky-700 transition-colors">
                      Open Marketplace →
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedAHPkg(null);
                      setForm(emptyForm());
                      setShowChartYaml(false);
                      setModalStep('configure');
                    }}
                    className="flex flex-col items-center gap-4 p-8 border-2 border-slate-200 rounded-2xl hover:border-emerald-400 hover:bg-emerald-50 transition-all text-center group"
                  >
                    <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                      <FileCode className="w-8 h-8 text-emerald-600" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-lg mb-1">Create from Scratch</div>
                      <div className="text-sm text-slate-500 leading-relaxed">
                        Start with a blank template and write your own Chart.yaml and values.yaml
                      </div>
                    </div>
                    <span className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-full group-hover:bg-emerald-700 transition-colors">
                      Start Blank →
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP: browse ── */}
            {modalStep === 'browse' && (
              <div className="flex flex-col" style={{ height: '640px' }}>
                {/* Search bar */}
                <div className="px-6 py-4 border-b border-slate-200 flex-shrink-0">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={ahQuery}
                        onChange={(e) => setAhQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAhSearch(ahQuery);
                        }}
                        placeholder="Search charts (e.g. nginx, prometheus, redis)…"
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                      />
                    </div>
                    <button
                      onClick={() => handleAhSearch(ahQuery)}
                      disabled={ahLoading}
                      className="px-5 py-2.5 bg-sky-600 text-white rounded-xl font-medium text-sm hover:bg-sky-700 disabled:opacity-50 transition-colors flex items-center gap-2 flex-shrink-0"
                    >
                      {ahLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                      Search
                    </button>
                    <button
                      onClick={() => {
                        setAhQuery('');
                        loadRandomCharts();
                      }}
                      disabled={ahLoading}
                      title="Shuffle — load random charts"
                      className="p-2.5 border border-slate-300 rounded-xl hover:bg-slate-100 disabled:opacity-50 transition-colors flex-shrink-0"
                    >
                      <RefreshCw
                        className={`w-4 h-4 text-slate-500 ${ahLoading ? 'animate-spin' : ''}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto p-6">
                  {ahLoading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
                      <span className="text-sm text-slate-500">Fetching charts from ArtifactHub…</span>
                    </div>
                  ) : ahResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                      <Package className="w-12 h-12 text-slate-200" />
                      <p className="text-slate-500 font-medium">No charts found</p>
                      <p className="text-slate-400 text-sm">Try a different search term or shuffle for random charts</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm text-slate-500">
                          {ahQuery ? `${ahResults.length} results for "${ahQuery}"` : `${ahResults.length} random charts`}
                        </span>
                        {ahQuery && (
                          <button
                            onClick={() => {
                              setAhQuery('');
                              loadRandomCharts();
                            }}
                            className="text-xs text-sky-600 hover:underline"
                          >
                            ← Show random
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        {ahResults.map((pkg) => (
                          <AHCard
                            key={pkg.package_id}
                            pkg={pkg}
                            onSelect={async () => {
                              setSelectedAHPkg(pkg);
                              setForm(pkgToForm(pkg));
                              setShowChartYaml(false);
                              setFetchError(null);
                              setValuesTab('ui');
                              setModalStep('configure');
                              // Auto-fetch real values immediately
                              setFetchingYaml(true);
                              const result = await ahFetchPackage(pkg);
                              setFetchingYaml(false);
                              if (result) {
                                setForm((f) => ({ ...f, values_yaml: result.values, chart_yaml: result.chartYaml }));
                              } else {
                                setFetchError('Could not fetch real values from ArtifactHub. Showing starter template.');
                              }
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP: configure ── */}
            {modalStep === 'configure' && (
              <>
                {/* ArtifactHub import banner */}
                {selectedAHPkg && (
                  <div className="mx-6 mt-5 flex items-center gap-3 p-3 bg-sky-50 border border-sky-200 rounded-xl">
                    {selectedAHPkg.logo_image_id ? (
                      <img
                        src={`https://artifacthub.io/image/${selectedAHPkg.logo_image_id}`}
                        alt={selectedAHPkg.name}
                        className="w-9 h-9 rounded-lg object-contain border border-sky-100 flex-shrink-0 bg-white p-0.5"
                      />
                    ) : (
                      <div
                        className={`w-9 h-9 rounded-lg bg-gradient-to-br ${
                          CARD_COLORS[selectedAHPkg.name.charCodeAt(0) % CARD_COLORS.length]
                        } flex items-center justify-center flex-shrink-0`}
                      >
                        <Package className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-sky-900">
                        {selectedAHPkg.name}{' '}
                        <span className="font-normal text-sky-600">v{selectedAHPkg.version}</span>
                      </div>
                      <div className="text-xs text-sky-600 truncate">
                        {selectedAHPkg.repository.display_name}
                      </div>
                    </div>
                    {selectedAHPkg.security_report_summary && (
                      <div className="flex-shrink-0">
                        <SecurityBadge s={selectedAHPkg.security_report_summary} />
                      </div>
                    )}
                    <a
                      href={`https://artifacthub.io/packages/helm/${selectedAHPkg.repository.name}/${selectedAHPkg.normalized_name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-sky-500 hover:text-sky-700 hover:bg-sky-100 rounded-lg transition-colors flex-shrink-0"
                      title="View on ArtifactHub"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                )}

                <div className="p-6 space-y-5">
                  {/* Row 1: Name + Version + App Version */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Chart Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. my-nginx"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Chart Version</label>
                      <input
                        type="text"
                        value={form.version}
                        onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                        placeholder="0.1.0"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">App Version</label>
                      <input
                        type="text"
                        value={form.app_version}
                        onChange={(e) => setForm((f) => ({ ...f, app_version: e.target.value }))}
                        placeholder="1.0.0"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-mono"
                      />
                    </div>
                  </div>

                  {/* Row 2: Repo URL + Status */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Repository URL</label>
                      <input
                        type="text"
                        value={form.repo_url}
                        onChange={(e) => setForm((f) => ({ ...f, repo_url: e.target.value }))}
                        placeholder="https://charts.bitnami.com/bitnami"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                      />
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
                        {form.is_active ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
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
                      placeholder="What does this chart deploy?"
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm resize-none"
                    />
                  </div>

              {/* ── values.yaml with Code / UI tabs ── */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700">values.yaml</span>
                      <div className="flex items-center gap-2">
                        {/* Fetch button – only when an AH package is selected */}
                        {selectedAHPkg && (
                          <button
                            type="button"
                            onClick={handleFetchFromAH}
                            disabled={fetchingYaml}
                            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50 transition-colors"
                          >
                            {fetchingYaml ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3" />
                            )}
                            {fetchingYaml ? 'Fetching…' : 'Re-fetch from ArtifactHub'}
                          </button>
                        )}
                        {/* Code / UI tab switcher */}
                        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setValuesTab('code')}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors ${
                              valuesTab === 'code'
                                ? 'bg-slate-800 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <Code2 className="w-3 h-3" /> Code
                          </button>
                          <button
                            type="button"
                            onClick={() => setValuesTab('ui')}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors ${
                              valuesTab === 'ui'
                                ? 'bg-sky-600 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <SlidersHorizontal className="w-3 h-3" /> UI Editor
                          </button>
                        </div>
                      </div>
                    </div>

                    {fetchError && (
                      <div className="mb-2 flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        {fetchError}
                      </div>
                    )}

                    {fetchingYaml ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3 border border-slate-200 rounded-xl bg-slate-50">
                        <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
                        <span className="text-sm text-slate-500">Fetching real values from ArtifactHub…</span>
                      </div>
                    ) : valuesTab === 'code' ? (
                      <CodeEditor
                        value={form.values_yaml}
                        onChange={(v) => setForm((f) => ({ ...f, values_yaml: v }))}
                        inline
                      />
                    ) : (
                      <ValuesUIEditor
                        yamlStr={form.values_yaml}
                        onChange={(v) => setForm((f) => ({ ...f, values_yaml: v }))}
                      />
                    )}
                  </div>

                  {/* ── Chart.yaml with Code / UI tabs (Advanced, collapsible) ── */}
                  <div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setShowChartYaml(!showChartYaml)}
                        className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                      >
                        {showChartYaml ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        Chart.yaml
                        <span className="text-xs text-slate-400 font-normal">(Advanced)</span>
                      </button>
                      {showChartYaml && (
                        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setChartYamlTab('code')}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors ${
                              chartYamlTab === 'code'
                                ? 'bg-slate-800 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <Code2 className="w-3 h-3" /> Code
                          </button>
                          <button
                            type="button"
                            onClick={() => setChartYamlTab('ui')}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors ${
                              chartYamlTab === 'ui'
                                ? 'bg-sky-600 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <SlidersHorizontal className="w-3 h-3" /> UI Editor
                          </button>
                        </div>
                      )}
                    </div>
                    {showChartYaml && (
                      <div className="mt-3">
                        {chartYamlTab === 'code' ? (
                          <CodeEditor
                            value={form.chart_yaml}
                            onChange={(v) => setForm((f) => ({ ...f, chart_yaml: v }))}
                            inline
                          />
                        ) : (
                          <ValuesUIEditor
                            yamlStr={form.chart_yaml}
                            onChange={(v) => setForm((f) => ({ ...f, chart_yaml: v }))}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Save message */}
                {saveMsg && (
                  <div className={`mx-6 mb-4 p-3 rounded-lg text-sm ${
                    saveMsg.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                  }`}>
                    <div className="flex items-start gap-2">
                      {saveMsg.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                      <div className="flex-1">
                        {saveMsg.text.includes('\n') ? (
                          <ul className="space-y-1">
                            {saveMsg.text.split('\n').map((line, i) => (
                              <li key={i} className={i === 0 ? 'font-medium' : 'text-xs opacity-90 ml-1'}>
                                {i === 0 ? line : `• ${line}`}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          saveMsg.text
                        )}
                      </div>
                    </div>
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
                    className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {editingChart ? 'Save Changes' : 'Create Chart'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ────────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Delete Chart</h3>
                  <p className="text-sm text-slate-500 mt-0.5">This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-slate-700 mb-2">
                Are you sure you want to delete{' '}
                <span className="font-semibold">"{deleteTarget.name}"</span>?
              </p>
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-5">
                Charts with active (deployed) releases cannot be deleted.
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
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete Chart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DEPLOY EDITOR MODAL ──────────────────────────────────────────────── */}
      {deployChart && (
        <HelmEditorModal
          chart={deployChart}
          onClose={() => setDeployChart(null)}
          onDeployed={() => { loadReleases(); }}
        />
      )}
    </div>
  );
}
