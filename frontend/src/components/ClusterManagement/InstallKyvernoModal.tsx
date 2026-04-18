'use client';

import { useState } from 'react';
import { X, Shield, Loader2, CheckCircle, AlertCircle, Download, ExternalLink, ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { installKyverno } from '../../lib/api';

interface InstallKyvernoModalProps {
  clusterId: number;
  clusterName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function InstallKyvernoModal({ clusterId, clusterName, onClose, onSuccess }: InstallKyvernoModalProps) {
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [showHelmInstructions, setShowHelmInstructions] = useState(false);
  const isHelmMissing = error?.toLowerCase().includes('helm') && error?.toLowerCase().includes('not installed');

  async function handleInstall() {
    setInstalling(true);
    setError(null);

    try {
      const result = await installKyverno(clusterId, {
        namespace: 'kyverno',
        release_name: 'kyverno',
        create_namespace: true,
      });

      if (result.data?.success) {
        setSuccess(true);
        setOutput(result.data.message || 'Kyverno installed successfully');
        setTimeout(() => {
          onSuccess();
        }, 2000);
      } else {
        setError(result.error || 'Failed to install Kyverno');
      }
    } catch {
      setError('Failed to install Kyverno. Please check the cluster connection.');
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Install Kyverno</h2>
              <p className="text-sm text-slate-500">Cluster: {clusterName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Status Messages */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">Installation Failed</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                  {isHelmMissing && (
                    <button
                      onClick={() => setShowHelmInstructions(prev => !prev)}
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-red-800 hover:text-red-900 underline underline-offset-2"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      {showHelmInstructions ? 'Hide' : 'See'} Helm install instructions
                      {showHelmInstructions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Helm Install Instructions */}
          {showHelmInstructions && (
            <div className="bg-slate-900 rounded-lg p-4 text-sm space-y-3">
              <div className="bg-amber-900/40 border border-amber-700/50 rounded p-2.5">
                <p className="text-amber-300 text-xs font-semibold">⚠ Important: Install Helm on the machine running the backend API server — NOT on the remote Kubernetes cluster.</p>
              </div>

              <p className="text-slate-300 font-medium">Install Helm 3.x on your <span className="text-amber-400">backend server</span>:</p>
              
              <div>
                <p className="text-slate-400 text-xs mb-1">Linux / WSL (recommended):</p>
                <div className="bg-slate-800 rounded p-2.5 font-mono text-xs text-emerald-400 select-all">
                  curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-xs mb-1">macOS (Homebrew):</p>
                <div className="bg-slate-800 rounded p-2.5 font-mono text-xs text-emerald-400 select-all">
                  brew install helm
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-xs mb-1">Windows (Chocolatey):</p>
                <div className="bg-slate-800 rounded p-2.5 font-mono text-xs text-emerald-400 select-all">
                  choco install kubernetes-helm
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-xs mb-1">Windows (Scoop):</p>
                <div className="bg-slate-800 rounded p-2.5 font-mono text-xs text-emerald-400 select-all">
                  scoop install helm
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-xs mb-1">Verify installation:</p>
                <div className="bg-slate-800 rounded p-2.5 font-mono text-xs text-emerald-400 select-all">
                  helm version
                </div>
              </div>

              <div className="pt-1 border-t border-slate-700 flex items-center gap-2">
                <a
                  href="https://helm.sh/docs/intro/install/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  Official Helm install docs <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <p className="text-xs text-amber-400">
                After installing Helm, restart the backend server and try again.
              </p>
            </div>
          )}

          {success && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-900">Kyverno Installed Successfully!</p>
                <p className="text-sm text-emerald-700 mt-1">{output}</p>
              </div>
            </div>
          )}

          {!success && (
            <>
              {/* Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-medium mb-1">Kyverno is not installed on this cluster</p>
                    <p className="text-blue-700">
                      Kyverno is a Kubernetes policy engine required for policy enforcement.
                      This will install Kyverno via Helm into the <code className="bg-blue-100 px-1 rounded font-mono text-xs">kyverno</code> namespace.
                    </p>
                  </div>
                </div>
              </div>

              {/* What will happen */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-700">This will:</h3>
                <ul className="space-y-1.5 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Create the <code className="bg-slate-100 px-1 rounded font-mono text-xs">kyverno</code> namespace
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Add the Kyverno Helm repository
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Install Kyverno using Helm chart
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Enable policy enforcement on this cluster
                  </li>
                </ul>
              </div>

              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700">
                  <strong>Note:</strong> Installation may take 1–3 minutes. Ensure Helm 3.x is installed on the backend server
                  and port <strong>6443</strong> is open to the cluster.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50 flex-shrink-0 rounded-b-2xl">
          {success ? (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={installing}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Skip for Now
              </button>
              <button
                onClick={handleInstall}
                disabled={installing}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {installing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Install Kyverno
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
