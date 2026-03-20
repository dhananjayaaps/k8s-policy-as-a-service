'use client';

import { useState, useEffect } from 'react';
import { X, Code, Layout, Rocket, AlertCircle, CheckCircle, Loader2, Plus, Trash2, Copy, Globe } from 'lucide-react';
import CodeEditor from './CodeEditor';
import UIEditor from './UIEditor';
import { validatePolicy, renderPolicyTemplate, deployPolicyMulti, getClusterNamespaces } from '../../lib/api';
import { useCluster } from '../../contexts/ClusterContext';
import type { Policy } from '../../types';

interface PolicyEditorModalProps {
  policy: Policy;
  isOpen: boolean;
  onClose: () => void;
  onDeploySuccess?: () => void;
  initialParameters?: Record<string, any>;
}

type EditorMode = 'code' | 'visual';

interface NamespaceConfig {
  namespace: string;
  parameters: Record<string, any>;
  useSharedParams: boolean; // true = use the shared params, false = custom per-namespace
}

interface DeployResult {
  namespace: string;
  success: boolean;
  message: string;
  deployment_id?: number;
}

export default function PolicyEditorModal({
  policy,
  isOpen,
  onClose,
  onDeploySuccess,
  initialParameters = {}
}: PolicyEditorModalProps) {
  const [editorMode, setEditorMode] = useState<EditorMode>('code');
  const [yamlContent, setYamlContent] = useState(policy.yaml_template || '');
  const [sharedParameters, setSharedParameters] = useState<Record<string, any>>({});
  const [renderedYamlContent, setRenderedYamlContent] = useState('');
  const [namespaceConfigs, setNamespaceConfigs] = useState<NamespaceConfig[]>([
    { namespace: 'default', parameters: {}, useSharedParams: true }
  ]);
  const [availableNamespaces, setAvailableNamespaces] = useState<string[]>([]);
  const [namespacesLoading, setNamespacesLoading] = useState(false);
  const [activeNsIndex, setActiveNsIndex] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [deploymentStatus, setDeploymentStatus] = useState<{
    type: 'success' | 'error' | 'partial' | null;
    message: string;
  }>({ type: null, message: '' });
  const [deployResults, setDeployResults] = useState<DeployResult[]>([]);

  const { clusters, selectedClusterId } = useCluster();

  useEffect(() => {
    if (isOpen) {
      setYamlContent(policy.yaml_template || '');
      setSharedParameters(initialParameters || {});
      setRenderedYamlContent('');
      setValidationResult(null);
      setDeploymentStatus({ type: null, message: '' });
      setDeployResults([]);
      setNamespaceConfigs([
        { namespace: 'default', parameters: initialParameters || {}, useSharedParams: true }
      ]);
      setActiveNsIndex(0);
    }
  }, [isOpen, policy, initialParameters]);

  // Load namespaces when cluster changes or modal opens
  useEffect(() => {
    if (isOpen && selectedClusterId) {
      loadNamespaces();
    }
  }, [isOpen, selectedClusterId]);

  async function loadNamespaces() {
    if (!selectedClusterId) return;
    setNamespacesLoading(true);
    try {
      const response = await getClusterNamespaces(selectedClusterId);
      if (response.data?.namespaces) {
        setAvailableNamespaces(response.data.namespaces);
      }
    } catch {
      setAvailableNamespaces([]);
    } finally {
      setNamespacesLoading(false);
    }
  }

  useEffect(() => {
    // Auto-render template when parameters change
    if (Object.keys(sharedParameters).length > 0) {
      renderTemplate();
    } else {
      setRenderedYamlContent(yamlContent);
    }
  }, [sharedParameters, yamlContent]);

  const renderTemplate = async () => {
    try {
      const response = await renderPolicyTemplate(yamlContent, sharedParameters);
      if (response.data?.success && response.data.rendered_yaml) {
        setRenderedYamlContent(response.data.rendered_yaml);
      }
    } catch (error) {
      console.error('Failed to render template:', error);
    }
  };

  const handleYamlChange = (newYaml: string) => {
    setYamlContent(newYaml);
    setDeploymentStatus({ type: null, message: '' });
  };

  const handleSharedParametersChange = (newParams: Record<string, any>) => {
    setSharedParameters(newParams);
    setDeploymentStatus({ type: null, message: '' });
  };

  const handleValidate = async () => {
    setIsValidating(true);
    const contentToValidate = renderedYamlContent || yamlContent;
    
    try {
      const response = await validatePolicy(contentToValidate);
      if (response.data) {
        setValidationResult({
          valid: response.data.valid,
          errors: response.data.errors || [],
          warnings: response.data.warnings || [],
        });
      }
    } catch {
      setValidationResult({
        valid: false,
        errors: ['Failed to validate policy'],
        warnings: [],
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Namespace management
  const addNamespace = () => {
    const usedNamespaces = new Set(namespaceConfigs.map(nc => nc.namespace));
    const available = availableNamespaces.filter(ns => !usedNamespaces.has(ns));
    const nextNs = available[0] || '';
    
    setNamespaceConfigs(prev => [
      ...prev,
      { namespace: nextNs, parameters: { ...sharedParameters }, useSharedParams: true }
    ]);
    setActiveNsIndex(namespaceConfigs.length);
  };

  const removeNamespace = (index: number) => {
    if (namespaceConfigs.length <= 1) return;
    setNamespaceConfigs(prev => prev.filter((_, i) => i !== index));
    if (activeNsIndex >= namespaceConfigs.length - 1) {
      setActiveNsIndex(Math.max(0, namespaceConfigs.length - 2));
    }
  };

  const updateNamespaceConfig = (index: number, updates: Partial<NamespaceConfig>) => {
    setNamespaceConfigs(prev => prev.map((nc, i) => i === index ? { ...nc, ...updates } : nc));
  };

  const duplicateNamespace = (index: number) => {
    const source = namespaceConfigs[index];
    const usedNamespaces = new Set(namespaceConfigs.map(nc => nc.namespace));
    const available = availableNamespaces.filter(ns => !usedNamespaces.has(ns));
    const nextNs = available[0] || '';
    
    setNamespaceConfigs(prev => [
      ...prev,
      { ...source, namespace: nextNs, useSharedParams: false, parameters: { ...source.parameters } }
    ]);
    setActiveNsIndex(namespaceConfigs.length);
  };

  const handleDeploy = async () => {
    if (!selectedClusterId) {
      setDeploymentStatus({ type: 'error', message: 'Please select a cluster first' });
      return;
    }

    if (namespaceConfigs.length === 0 || namespaceConfigs.some(nc => !nc.namespace)) {
      setDeploymentStatus({ type: 'error', message: 'Please select at least one namespace' });
      return;
    }

    // Validate before deploying
    setIsValidating(true);
    const contentToValidate = renderedYamlContent || yamlContent;
    let validation: { valid: boolean; errors: string[]; warnings: string[] } | null = null;

    try {
      const response = await validatePolicy(contentToValidate);
      if (response.data) {
        validation = {
          valid: response.data.valid,
          errors: response.data.errors || [],
          warnings: response.data.warnings || [],
        };
        setValidationResult(validation);
      }
    } catch {
      validation = { valid: false, errors: ['Failed to validate policy'], warnings: [] };
      setValidationResult(validation);
    } finally {
      setIsValidating(false);
    }

    if (validation && !validation.valid) {
      setDeploymentStatus({
        type: 'error',
        message: 'Cannot deploy invalid policy. Please fix validation errors first.',
      });
      return;
    }

    setIsDeploying(true);
    setDeploymentStatus({ type: null, message: '' });
    setDeployResults([]);

    try {
      const nsConfigs = namespaceConfigs.map(nc => ({
        namespace: nc.namespace,
        parameters: nc.useSharedParams
          ? (Object.keys(sharedParameters).length > 0 ? sharedParameters : undefined)
          : (Object.keys(nc.parameters).length > 0 ? nc.parameters : undefined),
      }));

      const response = await deployPolicyMulti({
        policy_id: Number(policy.id),
        cluster_id: selectedClusterId,
        namespace_configs: nsConfigs,
      });

      if (response.data) {
        setDeployResults(response.data.results || []);
        const allSuccess = response.data.results?.every(r => r.success) ?? false;
        const anySuccess = response.data.results?.some(r => r.success) ?? false;

        setDeploymentStatus({
          type: allSuccess ? 'success' : anySuccess ? 'partial' : 'error',
          message: response.data.message || (allSuccess ? 'All deployments successful!' : 'Some deployments failed'),
        });

        if (allSuccess) {
          onDeploySuccess?.();
          setTimeout(() => onClose(), 2500);
        } else if (anySuccess) {
          onDeploySuccess?.();
        }
      } else {
        setDeploymentStatus({
          type: 'error',
          message: response.error || 'Failed to deploy policy',
        });
      }
    } catch (error) {
      setDeploymentStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to deploy policy',
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const selectedCluster = clusters.find(c => c.id === selectedClusterId);
  const activeConfig = namespaceConfigs[activeNsIndex];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-900 truncate">{policy.title}</h2>
            <p className="text-sm text-slate-500 mt-0.5 truncate">{policy.description}</p>
          </div>
          <div className="flex items-center gap-3 ml-4">
            <div className="text-right">
              <div className="text-xs text-slate-500">Target Cluster</div>
              <div className="text-sm font-semibold text-slate-800">{selectedCluster?.name || 'None'}</div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Editor */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200">
            {/* Editor Mode Tabs */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <button
                onClick={() => setEditorMode('code')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs transition-colors ${
                  editorMode === 'code' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                Code
              </button>
              <button
                onClick={() => setEditorMode('visual')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs transition-colors ${
                  editorMode === 'visual' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Layout className="w-3.5 h-3.5" />
                Parameters
              </button>
            </div>

            {/* Editor Content */}
            <div className="flex-1 overflow-hidden p-4">
              {editorMode === 'code' ? (
                <CodeEditor value={yamlContent} onChange={handleYamlChange} height="100%" />
              ) : (
                <UIEditor yaml={yamlContent} parameters={sharedParameters} onParametersChange={handleSharedParametersChange} />
              )}
            </div>
          </div>

          {/* Right: Namespace Configuration Panel */}
          <div className="w-80 flex flex-col bg-slate-50">
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-slate-600" />
                  <span className="text-sm font-semibold text-slate-800">Namespaces</span>
                </div>
                <button
                  onClick={addNamespace}
                  disabled={namespacesLoading}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors disabled:opacity-50"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
              </div>
              <p className="text-xs text-slate-500">Deploy to multiple namespaces with different configurations</p>
            </div>

            {/* Namespace Tabs */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-3 space-y-2">
                {namespaceConfigs.map((nc, index) => (
                  <div
                    key={index}
                    className={`rounded-lg border transition-all cursor-pointer ${
                      activeNsIndex === index
                        ? 'border-emerald-300 bg-white shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div
                      className="flex items-center gap-2 px-3 py-2.5"
                      onClick={() => setActiveNsIndex(index)}
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${activeNsIndex === index ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <div className="flex-1 min-w-0">
                        {namespacesLoading ? (
                          <div className="flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                            <span className="text-xs text-slate-400">Loading...</span>
                          </div>
                        ) : availableNamespaces.length > 0 ? (
                          <select
                            value={nc.namespace}
                            onChange={(e) => updateNamespaceConfig(index, { namespace: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full text-sm font-medium text-slate-800 bg-transparent border-none focus:outline-none focus:ring-0 p-0 cursor-pointer"
                          >
                            <option value="">Select namespace...</option>
                            {availableNamespaces.map(ns => (
                              <option key={ns} value={ns} disabled={namespaceConfigs.some((c, i) => i !== index && c.namespace === ns)}>
                                {ns}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={nc.namespace}
                            onChange={(e) => updateNamespaceConfig(index, { namespace: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full text-sm font-medium text-slate-800 bg-transparent border-none focus:outline-none p-0"
                            placeholder="namespace"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); duplicateNamespace(index); }}
                          className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                          title="Duplicate with custom params"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {namespaceConfigs.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); removeNamespace(index); }}
                            className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"
                            title="Remove"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Per-namespace config when expanded */}
                    {activeNsIndex === index && (
                      <div className="px-3 pb-3 border-t border-slate-100">
                        <div className="mt-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={nc.useSharedParams}
                              onChange={(e) => updateNamespaceConfig(index, {
                                useSharedParams: e.target.checked,
                                parameters: e.target.checked ? {} : { ...sharedParameters }
                              })}
                              className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                            />
                            <span className="text-xs text-slate-600">Use shared parameters</span>
                          </label>
                        </div>
                        {!nc.useSharedParams && (
                          <div className="mt-2 space-y-2">
                            <p className="text-xs text-amber-600 font-medium">Custom parameters for this namespace:</p>
                            {Object.entries(nc.parameters).length > 0 ? (
                              Object.entries(nc.parameters).map(([key, value]) => (
                                <div key={key} className="flex items-center gap-1.5">
                                  <span className="text-xs text-slate-500 font-mono truncate flex-shrink-0 w-20" title={key}>{key}</span>
                                  <input
                                    type="text"
                                    value={typeof value === 'string' ? value : JSON.stringify(value)}
                                    onChange={(e) => {
                                      const newParams = { ...nc.parameters, [key]: e.target.value };
                                      updateNamespaceConfig(index, { parameters: newParams });
                                    }}
                                    className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-slate-400 italic">Set parameters in the Parameters tab first, then customize here</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Deploy Results */}
            {deployResults.length > 0 && (
              <div className="px-3 py-2 border-t border-slate-200 max-h-40 overflow-y-auto">
                <p className="text-xs font-semibold text-slate-700 mb-1.5">Deployment Results</p>
                <div className="space-y-1">
                  {deployResults.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                      r.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                    }`}>
                      {r.success ? <CheckCircle className="w-3 h-3 flex-shrink-0" /> : <AlertCircle className="w-3 h-3 flex-shrink-0" />}
                      <span className="font-medium truncate">{r.namespace}</span>
                      <span className="text-[10px] opacity-75 truncate flex-1">{r.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Validation Result */}
        {validationResult && (
          <div className="px-6 py-2 border-t border-slate-200">
            {validationResult.valid ? (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm font-medium text-green-800">Policy is valid</span>
                {validationResult.warnings.length > 0 && (
                  <span className="text-xs text-green-600 ml-2">({validationResult.warnings.length} warning{validationResult.warnings.length !== 1 ? 's' : ''})</span>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-red-800">{validationResult.errors.length} error(s)</span>
                  <ul className="text-xs text-red-700 mt-0.5 space-y-0.5">
                    {validationResult.errors.slice(0, 3).map((error, idx) => (
                      <li key={idx}>• {error}</li>
                    ))}
                    {validationResult.errors.length > 3 && (
                      <li className="text-red-500">...and {validationResult.errors.length - 3} more</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Deployment Status */}
        {deploymentStatus.type && (
          <div className="px-6 py-2 border-t border-slate-200">
            <div className={`flex items-center gap-2 p-2 rounded-lg border ${
              deploymentStatus.type === 'success' ? 'bg-green-50 border-green-200' :
              deploymentStatus.type === 'partial' ? 'bg-amber-50 border-amber-200' :
              'bg-red-50 border-red-200'
            }`}>
              {deploymentStatus.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
              ) : deploymentStatus.type === 'partial' ? (
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              )}
              <span className={`text-sm font-medium ${
                deploymentStatus.type === 'success' ? 'text-green-800' :
                deploymentStatus.type === 'partial' ? 'text-amber-800' :
                'text-red-800'
              }`}>
                {deploymentStatus.message}
              </span>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{namespaceConfigs.length} namespace{namespaceConfigs.length !== 1 ? 's' : ''} selected</span>
            <span className="text-slate-300">|</span>
            <span>{Object.keys(sharedParameters).length} shared parameter{Object.keys(sharedParameters).length !== 1 ? 's' : ''}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleValidate}
              disabled={isValidating}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isValidating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              Validate
            </button>

            <button
              onClick={handleDeploy}
              disabled={isDeploying || !selectedClusterId || namespaceConfigs.some(nc => !nc.namespace)}
              className="px-5 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="w-3.5 h-3.5" />
                  Deploy to {namespaceConfigs.length} Namespace{namespaceConfigs.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
