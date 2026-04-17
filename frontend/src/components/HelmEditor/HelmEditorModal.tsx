'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  Play,
  Plus,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  Shield,
  Tag,
} from 'lucide-react';
import CodeEditor from '../PolicyEditor/CodeEditor';
import { useCluster } from '../../contexts/ClusterContext';
import {
  getClusterNamespaces,
  deployHelmChart,
  deployHelmChartMulti,
  validateHelmYaml,
} from '../../lib/api';
import type { HelmChart } from '../../types';

// ── Error parsing ─────────────────────────────────────────────────────────────

interface PolicyViolation {
  resource?: string;
  policy: string;
  rule: string;
  message: string;
}
interface ParsedHelmError {
  type: 'policy-violation' | 'generic';
  summary: string;
  violations: PolicyViolation[];
  raw: string;
}

function parseHelmError(raw: string): ParsedHelmError {
  if (raw.includes('admission webhook') && raw.includes('denied the request')) {
    const violations: PolicyViolation[] = [];
    const resourceMatch = raw.match(/resource\s+(\S+)\s+was blocked/);
    const resource = resourceMatch ? resourceMatch[1] : undefined;

    // Grab everything after "following policies" and scan for POLICY:\n  RULE: 'validation error: …'
    const after = raw.split('following policies').pop() || raw;
    const policyRuleRe = /([\w-]+):[\s\n]+([\w-]+):\s*'validation error:\s*([\s\S]+?)(?:'(?:\s|$)|$)/g;
    let m: RegExpExecArray | null;
    while ((m = policyRuleRe.exec(after)) !== null) {
      violations.push({
        resource,
        policy: m[1].trim(),
        rule: m[2].trim(),
        message: m[3].trim().replace(/\s+/g, ' ').replace(/'{2}/g, "'"),
      });
    }

    // Fallback: grab first POLICY: RULE: pair without validation error text
    if (violations.length === 0) {
      const simpleMatch = after.match(/([\w-]+):[\s\n]+([\w-]+):/);
      if (simpleMatch) {
        violations.push({ resource, policy: simpleMatch[1], rule: simpleMatch[2], message: 'Resource blocked by admission policy.' });
      }
    }

    return {
      type: 'policy-violation',
      summary: violations.length > 0
        ? `Blocked by policy \"${violations[0].policy}\"`
        : 'Blocked by Kyverno admission webhook',
      violations,
      raw,
    };
  }

  // Generic — pull the last "Error: …" line as summary
  const errorMatch = raw.match(/Error:\s*(.+)/s);
  const summary = errorMatch
    ? errorMatch[1].replace(/\s+/g, ' ').trim().slice(0, 200)
    : raw.replace(/\s+/g, ' ').trim().slice(0, 200);

  return { type: 'generic', summary, violations: [], raw };
}

type NamespaceRelease = {
  release_name: string;
  namespace: string;
  values_yaml: string;
  useSharedValues: boolean;
};

type DeployResult = {
  release_name: string;
  namespace: string;
  success: boolean;
  message: string;
};

type Props = {
  chart: HelmChart;
  onClose: () => void;
  onDeployed?: () => void;
};

export default function HelmEditorModal({ chart, onClose, onDeployed }: Props) {
  const { clusters, selectedClusterId } = useCluster();

  // Tabs: chart | values | deploy
  const [activeTab, setActiveTab] = useState<'chart' | 'values' | 'deploy'>('values');

  // Editable content
  const [chartYaml, setChartYaml] = useState(chart.chart_yaml || '');
  const [valuesYaml, setValuesYaml] = useState(chart.values_yaml || '');

  // Deploy state
  const [clusterId, setClusterId] = useState<number>(selectedClusterId ? Number(selectedClusterId) : 0);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [loadingNs, setLoadingNs] = useState(false);

  // Multi-namespace releases
  const [releases, setReleases] = useState<NamespaceRelease[]>([
    { release_name: chart.name, namespace: 'default', values_yaml: chart.values_yaml || '', useSharedValues: true },
  ]);
  const [sharedValues, setSharedValues] = useState(chart.values_yaml || '');

  // Validation & deploy results
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployResults, setDeployResults] = useState<DeployResult[]>([]);
  const [deployMsg, setDeployMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load namespaces when cluster changes
  useEffect(() => {
    if (clusterId) loadNamespaces(clusterId);
  }, [clusterId]);

  async function loadNamespaces(cid: number) {
    setLoadingNs(true);
    const res = await getClusterNamespaces(cid);
    if (res.data?.namespaces) setNamespaces(res.data.namespaces);
    else setNamespaces(['default']);
    setLoadingNs(false);
  }

  function addRelease() {
    setReleases((prev) => [
      ...prev,
      {
        release_name: `${chart.name}-${prev.length + 1}`,
        namespace: 'default',
        values_yaml: sharedValues,
        useSharedValues: true,
      },
    ]);
  }

  function removeRelease(index: number) {
    setReleases((prev) => prev.filter((_, i) => i !== index));
  }

  function duplicateRelease(index: number) {
    setReleases((prev) => {
      const dup = { ...prev[index], release_name: `${prev[index].release_name}-copy` };
      return [...prev.slice(0, index + 1), dup, ...prev.slice(index + 1)];
    });
  }

  function updateRelease(index: number, field: keyof NamespaceRelease, value: any) {
    setReleases((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  async function handleValidate() {
    setValidating(true);
    setValidationResult(null);
    const res = await validateHelmYaml(activeTab === 'chart' ? chartYaml : valuesYaml);
    if (res.data) setValidationResult(res.data);
    else setValidationResult({ valid: false, errors: [res.error || 'Validation failed'] });
    setValidating(false);
  }

  async function handleDeploy() {
    if (!clusterId) {
      setDeployMsg({ type: 'error', text: 'Select a cluster first.' });
      return;
    }
    if (releases.length === 0) {
      setDeployMsg({ type: 'error', text: 'Add at least one release.' });
      return;
    }
    for (const r of releases) {
      if (!r.release_name.trim()) {
        setDeployMsg({ type: 'error', text: 'All releases must have a name.' });
        return;
      }
    }

    setDeploying(true);
    setDeployMsg(null);
    setDeployResults([]);

    if (releases.length === 1) {
      const r = releases[0];
      const res = await deployHelmChart({
        chart_id: chart.id,
        cluster_id: clusterId,
        release_name: r.release_name,
        namespace: r.namespace,
        values_yaml: r.useSharedValues ? sharedValues : r.values_yaml,
      });
      if (res.data?.success) {
        setDeployResults([{ release_name: r.release_name, namespace: r.namespace, success: true, message: res.data.message }]);
        setDeployMsg({ type: 'success', text: res.data.message });
        onDeployed?.();
      } else {
        const parsed = parseHelmError(res.error || 'Deployment failed.');
        setDeployResults([{ release_name: r.release_name, namespace: r.namespace, success: false, message: res.error || 'Deployment failed.' }]);
        setDeployMsg({ type: 'error', text: parsed.summary });
      }
    } else {
      const res = await deployHelmChartMulti({
        chart_id: chart.id,
        cluster_id: clusterId,
        releases: releases.map((r) => ({
          release_name: r.release_name,
          namespace: r.namespace,
          values_yaml: r.useSharedValues ? sharedValues : r.values_yaml,
        })),
      });
      if (res.data) {
        setDeployResults(res.data.results || []);
        setDeployMsg({ type: res.data.success ? 'success' : 'error', text: res.data.message });
        if (res.data.success) onDeployed?.();
      } else {
        const parsed = parseHelmError(res.error || 'Deployment failed.');
        setDeployMsg({ type: 'error', text: parsed.summary });
      }
    }
    setDeploying(false);
  }

  const TABS = [
    { key: 'chart' as const, label: 'Chart.yaml' },
    { key: 'values' as const, label: 'values.yaml' },
    { key: 'deploy' as const, label: 'Deploy' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-sky-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {chart.name}
                {chart.version && <span className="text-sm font-normal text-slate-400 ml-2">v{chart.version}</span>}
              </h2>
              {chart.description && <p className="text-xs text-slate-500">{chart.description}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-200 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setValidationResult(null); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-sky-500 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto" style={{ height: 520 }}>
          {/* ── Chart.yaml tab ────────────────────────── */}
          {activeTab === 'chart' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">Chart.yaml</label>
                <button
                  onClick={handleValidate}
                  disabled={validating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Validate
                </button>
              </div>
              <CodeEditor value={chartYaml} onChange={setChartYaml} inline height="380px" />
              {validationResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${validationResult.valid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {validationResult.valid ? 'Valid YAML' : validationResult.errors.join('\n')}
                </div>
              )}
            </div>
          )}

          {/* ── values.yaml tab ───────────────────────── */}
          {activeTab === 'values' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">values.yaml (default)</label>
                <button
                  onClick={handleValidate}
                  disabled={validating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Validate
                </button>
              </div>
              <CodeEditor value={valuesYaml} onChange={setValuesYaml} inline height="380px" />
              {validationResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${validationResult.valid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {validationResult.valid ? 'Valid YAML' : validationResult.errors.join('\n')}
                </div>
              )}
            </div>
          )}

          {/* ── Deploy tab ────────────────────────────── */}
          {activeTab === 'deploy' && (
            <div className="space-y-5">
              {/* Cluster selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Target Cluster</label>
                <select
                  value={clusterId}
                  onChange={(e) => setClusterId(Number(e.target.value))}
                  className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                >
                  <option value={0}>Select cluster…</option>
                  {clusters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Shared values */}
              <div>
                <button
                  type="button"
                  onClick={() => {}}
                  className="flex items-center gap-2 text-sm font-medium text-slate-600 mb-2"
                >
                  Shared values.yaml (applied to all releases using shared mode)
                </button>
                <CodeEditor value={sharedValues} onChange={setSharedValues} inline height="200px" />
              </div>

              {/* Releases list */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-800">Releases</h3>
                  <button
                    onClick={addRelease}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Release
                  </button>
                </div>

                <div className="space-y-3">
                  {releases.map((rel, idx) => (
                    <ReleaseCard
                      key={idx}
                      index={idx}
                      release={rel}
                      namespaces={namespaces}
                      loadingNs={loadingNs}
                      sharedValues={sharedValues}
                      onChange={(field, val) => updateRelease(idx, field, val)}
                      onRemove={() => removeRelease(idx)}
                      onDuplicate={() => duplicateRelease(idx)}
                      canRemove={releases.length > 1}
                    />
                  ))}
                </div>
              </div>

              {/* Deploy results */}
              {deployResults.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    Deployment Results
                  </div>
                  <div className="divide-y divide-slate-100">
                    {deployResults.map((r, i) => {
                      const parsed = r.success ? null : parseHelmError(r.message);
                      return (
                        <div key={i} className="p-4">
                          {/* Row header */}
                          <div className="flex items-center gap-2.5 mb-2">
                            {r.success ? (
                              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            )}
                            <span className="font-semibold text-slate-800 font-mono text-sm">{r.release_name}</span>
                            <span className="text-slate-400 text-xs">→</span>
                            <span className="text-slate-500 text-sm font-mono">{r.namespace}</span>
                            {r.success && (
                              <span className="ml-auto text-xs text-emerald-600 font-medium">{r.message}</span>
                            )}
                          </div>

                          {/* Error detail panel */}
                          {!r.success && parsed && (
                            <div className="ml-6">
                              {parsed.type === 'policy-violation' ? (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                                  <div className="flex items-center gap-2 text-amber-800 font-semibold text-xs uppercase tracking-wide">
                                    <Shield className="w-3.5 h-3.5" />
                                    Admission Policy Violation
                                  </div>
                                  {parsed.violations.map((v, vi) => (
                                    <div key={vi} className="space-y-1">
                                      {v.resource && (
                                        <div className="flex items-start gap-2 text-xs">
                                          <span className="text-amber-600 font-medium w-16 flex-shrink-0">Resource</span>
                                          <span className="text-amber-900 font-mono">{v.resource}</span>
                                        </div>
                                      )}
                                      <div className="flex items-start gap-2 text-xs">
                                        <span className="text-amber-600 font-medium w-16 flex-shrink-0">Policy</span>
                                        <span className="text-amber-900 font-mono bg-amber-100 px-1.5 py-0.5 rounded">{v.policy}</span>
                                      </div>
                                      <div className="flex items-start gap-2 text-xs">
                                        <span className="text-amber-600 font-medium w-16 flex-shrink-0">Rule</span>
                                        <span className="text-amber-900 font-mono bg-amber-100 px-1.5 py-0.5 rounded">{v.rule}</span>
                                      </div>
                                      <div className="flex items-start gap-2 text-xs">
                                        <span className="text-amber-600 font-medium w-16 flex-shrink-0">Reason</span>
                                        <span className="text-amber-900">{v.message}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                  <p className="text-xs font-semibold text-red-700 mb-1">Helm Error</p>
                                  <p className="text-xs text-red-800">{parsed.summary}</p>
                                  <details className="mt-2">
                                    <summary className="text-xs text-red-500 cursor-pointer select-none hover:text-red-700">Show raw output</summary>
                                    <pre className="mt-2 text-xs text-red-700 whitespace-pre-wrap break-all font-mono bg-red-100 rounded p-2 max-h-48 overflow-y-auto">{parsed.raw}</pre>
                                  </details>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Message bar */}
        {deployMsg && (
          <div className={`mx-6 mb-4 p-3 rounded-lg text-sm ${
            deployMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            <div className="flex items-center gap-2">
              {deployMsg.type === 'success'
                ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              <span className="font-medium">{deployMsg.text}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Close
          </button>
          {activeTab === 'deploy' && (
            <button
              onClick={handleDeploy}
              disabled={deploying || !clusterId}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {deploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Deploy {releases.length > 1 ? `(${releases.length})` : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Release Card sub-component ──────────────────────────────────────────────

function ReleaseCard({
  index,
  release,
  namespaces,
  loadingNs,
  sharedValues,
  onChange,
  onRemove,
  onDuplicate,
  canRemove,
}: {
  index: number;
  release: NamespaceRelease;
  namespaces: string[];
  loadingNs: boolean;
  sharedValues: string;
  onChange: (field: keyof NamespaceRelease, value: any) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  canRemove: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
        <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-slate-600">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <span className="text-xs font-semibold text-slate-400 uppercase w-6">#{index + 1}</span>

        <input
          type="text"
          value={release.release_name}
          onChange={(e) => onChange('release_name', e.target.value)}
          placeholder="Release name"
          className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
        />

        <select
          value={release.namespace}
          onChange={(e) => onChange('namespace', e.target.value)}
          className="w-48 px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          {loadingNs ? (
            <option>Loading…</option>
          ) : (
            namespaces.map((ns) => (
              <option key={ns} value={ns}>{ns}</option>
            ))
          )}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={release.useSharedValues}
            onChange={(e) => onChange('useSharedValues', e.target.checked)}
            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          Shared values
        </label>

        <button onClick={onDuplicate} title="Duplicate" className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded">
          <Copy className="w-3.5 h-3.5" />
        </button>
        {canRemove && (
          <button onClick={onRemove} title="Remove" className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Expanded: custom values editor */}
      {expanded && !release.useSharedValues && (
        <div className="p-4 border-t border-slate-200">
          <label className="block text-xs font-medium text-slate-600 mb-1">Custom values.yaml for this release</label>
          <CodeEditor
            value={release.values_yaml}
            onChange={(v) => onChange('values_yaml', v)}
            inline
            height="200px"
          />
        </div>
      )}
      {expanded && release.useSharedValues && (
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-500 italic">Using shared values.yaml — uncheck "Shared values" to customize.</p>
        </div>
      )}
    </div>
  );
}
