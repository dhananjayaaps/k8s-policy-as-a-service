'use client';

import { useState, useEffect } from 'react';
import { X, Code, Layout, Rocket, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import CodeEditor from './CodeEditor';
import UIEditor from './UIEditor';
import { validatePolicy, renderPolicyTemplate, deployPolicy } from '../../lib/api';
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

export default function PolicyEditorModal({
  policy,
  isOpen,
  onClose,
  onDeploySuccess,
  initialParameters = {}
}: PolicyEditorModalProps) {
  const [editorMode, setEditorMode] = useState<EditorMode>('code');
  const [yamlContent, setYamlContent] = useState(policy.yaml_template || '');
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [renderedYamlContent, setRenderedYamlContent] = useState('');
  const [selectedNamespace, setSelectedNamespace] = useState('default');
  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [deploymentStatus, setDeploymentStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  const { clusters, selectedClusterId } = useCluster();

  useEffect(() => {
    if (isOpen) {
      setYamlContent(policy.yaml_template || '');
      // Use initialParameters if provided (current deployed values)
      setParameters(initialParameters || {});
      setRenderedYamlContent('');
      setValidationResult(null);
      setDeploymentStatus({ type: null, message: '' });
    }
  }, [isOpen, policy, initialParameters]);

  useEffect(() => {
    // Auto-render template when parameters change
    if (Object.keys(parameters).length > 0) {
      renderTemplate();
    } else {
      setRenderedYamlContent(yamlContent);
    }
  }, [parameters, yamlContent]);

  const renderTemplate = async () => {
    try {
      const response = await renderPolicyTemplate(yamlContent, parameters);
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

  const handleParametersChange = (newParams: Record<string, any>) => {
    setParameters(newParams);
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
    } catch (error) {
      setValidationResult({
        valid: false,
        errors: ['Failed to validate policy'],
        warnings: [],
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleDeploy = async () => {
    if (!selectedClusterId) {
      setDeploymentStatus({
        type: 'error',
        message: 'Please select a cluster first',
      });
      return;
    }

    // Validate before deploying
    await handleValidate();
    
    if (validationResult && !validationResult.valid) {
      setDeploymentStatus({
        type: 'error',
        message: 'Cannot deploy invalid policy. Please fix validation errors first.',
      });
      return;
    }

    setIsDeploying(true);
    setDeploymentStatus({ type: null, message: '' });

    try {
      const response = await deployPolicy({
        policy_id: parseInt(policy.id),
        cluster_id: parseInt(selectedClusterId),
        namespace: selectedNamespace,
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      });

      if (response.data?.success) {
        setDeploymentStatus({
          type: 'success',
          message: response.data.message || 'Policy deployed successfully!',
        });
        onDeploySuccess?.();
        setTimeout(() => {
          onClose();
        }, 2000);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{policy.title}</h2>
            <p className="text-sm text-slate-600 mt-1">{policy.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Editor Mode Tabs */}
        <div className="flex items-center gap-2 px-6 py-3 bg-slate-50 border-b border-slate-200">
          <button
            onClick={() => setEditorMode('code')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              editorMode === 'code'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Code className="w-4 h-4" />
            Code Editor
          </button>
          <button
            onClick={() => setEditorMode('visual')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              editorMode === 'visual'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Layout className="w-4 h-4" />
            Visual Editor
          </button>
        </div>

        {/* Editor Content */}
        <div className="flex-1 overflow-hidden px-6 py-4">
          {editorMode === 'code' ? (
            <CodeEditor
              value={yamlContent}
              onChange={handleYamlChange}
              height="100%"
            />
          ) : (
            <UIEditor
              yaml={yamlContent}
              parameters={parameters}
              onParametersChange={handleParametersChange}
            />
          )}
        </div>

        {/* Validation Result */}
        {validationResult && (
          <div className="px-6 py-3 border-t border-slate-200">
            {validationResult.valid ? (
              <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-green-900">Policy is valid!</div>
                  {validationResult.warnings.length > 0 && (
                    <ul className="text-xs text-green-700 mt-1 space-y-1">
                      {validationResult.warnings.map((warning, idx) => (
                        <li key={idx}>⚠️ {warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-red-900 mb-1">
                    {validationResult.errors.length} validation error(s)
                  </div>
                  <ul className="text-xs text-red-700 space-y-1">
                    {validationResult.errors.map((error, idx) => (
                      <li key={idx}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Deployment Status */}
        {deploymentStatus.type && (
          <div className="px-6 py-3 border-t border-slate-200">
            <div
              className={`flex items-start gap-2 p-3 rounded-lg border ${
                deploymentStatus.type === 'success'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              {deploymentStatus.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              )}
              <div className={`text-sm ${
                deploymentStatus.type === 'success' ? 'text-green-900' : 'text-red-900'
              }`}>
                {deploymentStatus.message}
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Target Cluster
              </label>
              <div className="text-sm font-semibold text-slate-900">
                {selectedCluster?.name || 'No cluster selected'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Namespace
              </label>
              <input
                type="text"
                value={selectedNamespace}
                onChange={(e) => setSelectedNamespace(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="default"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleValidate}
              disabled={isValidating}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Validate
                </>
              )}
            </button>

            <button
              onClick={handleDeploy}
              disabled={isDeploying || !selectedClusterId}
              className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  Deploy Policy
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
