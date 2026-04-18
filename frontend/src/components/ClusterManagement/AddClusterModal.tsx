'use client';

import { useState } from 'react';
import { X, Terminal, Upload, Key, Server, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import {
  sshConnect,
  setupCluster,
  connectClusterViaKubeconfig,
  connectClusterViaToken,
  createCluster,
  sshDisconnect
} from '../../lib/api';

type SetupMethod = 'ssh' | 'kubeconfig' | 'token';

interface AddClusterModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddClusterModal({ onClose, onSuccess }: AddClusterModalProps) {
  const [method, setMethod] = useState<SetupMethod>('ssh');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Add Kubernetes Cluster</h2>
            <p className="text-sm text-slate-600 mt-1">
              Choose your preferred connection method
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Method Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50">
          <button
            onClick={() => setMethod('ssh')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              method === 'ssh'
                ? 'border-emerald-600 text-emerald-600 font-medium'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-4 h-4" />
            SSH Remote Setup
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Recommended</span>
          </button>
          <button
            onClick={() => setMethod('kubeconfig')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              method === 'kubeconfig'
                ? 'border-emerald-600 text-emerald-600 font-medium'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-4 h-4" />
            Kubeconfig
          </button>
          <button
            onClick={() => setMethod('token')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              method === 'token'
                ? 'border-emerald-600 text-emerald-600 font-medium'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Key className="w-4 h-4" />
            Service Account Token
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Status Messages */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}
          {success && (
            <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-900">Success</p>
                <p className="text-sm text-emerald-700 mt-1">{success}</p>
              </div>
            </div>
          )}

          {method === 'ssh' && (
            <SSHSetupForm 
              loading={loading}
              setLoading={setLoading}
              setError={setError}
              setSuccess={setSuccess}
              onSuccess={onSuccess}
            />
          )}
          {method === 'kubeconfig' && (
            <KubeconfigForm 
              loading={loading}
              setLoading={setLoading}
              setError={setError}
              setSuccess={setSuccess}
              onSuccess={onSuccess}
            />
          )}
          {method === 'token' && (
            <TokenForm 
              loading={loading}
              setLoading={setLoading}
              setError={setError}
              setSuccess={setSuccess}
              onSuccess={onSuccess}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// SSH Remote Setup Form
function SSHSetupForm({ loading, setLoading, setError, setSuccess, onSuccess }: any) {
  const [formData, setFormData] = useState({
    host: '',
    username: '',
    authMethod: 'password' as 'password' | 'key',
    password: '',
    pemKey: '',
    port: '22',
    clusterName: '',
    description: '',
    installKyverno: true,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    let sessionId: string | null = null;

    try {
      // Step 1: Connect via SSH
      const sshResponse = await sshConnect({
        host: formData.host,
        username: formData.username,
        password: formData.authMethod === 'password' ? formData.password : undefined,
        pem_key_content: formData.authMethod === 'key' ? formData.pemKey : undefined,
        port: parseInt(formData.port, 10),
      });

      if (sshResponse.error || !sshResponse.data) {
        throw new Error(sshResponse.error || 'Failed to connect via SSH');
      }

      sessionId = sshResponse.data.session_id;

      // Step 2: Setup cluster
      const setupResponse = await setupCluster({
        session_id: sessionId,
        cluster_name: formData.clusterName,
        cluster_description: formData.description || undefined,
        service_account_name: 'kyverno-admin',
        namespace: 'kyverno',
        role_type: 'cluster-admin',
        install_kyverno: formData.installKyverno,
        kyverno_namespace: formData.installKyverno ? 'kyverno' : undefined,
        verify_ssl: false,
      });

      if (setupResponse.error || !setupResponse.data) {
        throw new Error(setupResponse.error || 'Failed to setup cluster');
      }

      setSuccess(
        `Cluster "${setupResponse.data.cluster_name}" added successfully!${
          setupResponse.data.kyverno_installed ? ' Kyverno installed.' : ''
        }`
      );

      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      // Cleanup: disconnect SSH
      if (sessionId) {
        await sshDisconnect(sessionId);
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Server className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium mb-1">SSH Remote Setup (Recommended)</p>
            <p className="text-blue-700">
              Automatically connects to your remote server, verifies kubectl connectivity,
              creates a service account, and saves credentials to the database.
              Optionally installs Kyverno.
            </p>
          </div>
        </div>
      </div>

      {/* Port Requirement Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium mb-1">Network Requirements</p>
            <ul className="text-amber-700 list-disc list-inside space-y-1">
              <li>Use the <strong>Public IP</strong> of your server</li>
              <li>Open port <strong>22</strong> (SSH) on your firewall / security group</li>
              <li>Open port <strong>6443</strong> (Kubernetes API) for cluster operations &amp; Kyverno install</li>
            </ul>
          </div>
        </div>
      </div>

      {/* SSH Connection Details */}
      <div className="space-y-4">
        <h3 className="font-semibold text-slate-900">SSH Connection</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Host / Public IP Address *
            </label>
            <input
              type="text"
              value={formData.host}
              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              placeholder="e.g. 54.123.45.67 or example.com"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Port
            </label>
            <input
              type="number"
              value={formData.port}
              onChange={(e) => setFormData({ ...formData, port: e.target.value })}
              placeholder="22"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Username *
          </label>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            placeholder="ubuntu, ec2-user, root, etc."
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            required
          />
        </div>

        {/* Auth Method */}
        <div className="flex gap-4 mb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={formData.authMethod === 'password'}
              onChange={() => setFormData({ ...formData, authMethod: 'password' })}
              className="text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm text-slate-700">Password</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={formData.authMethod === 'key'}
              onChange={() => setFormData({ ...formData, authMethod: 'key' })}
              className="text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm text-slate-700">PEM Key</span>
          </label>
        </div>

        {formData.authMethod === 'password' ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Password *
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              required
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              PEM Private Key *
            </label>
            <textarea
              value={formData.pemKey}
              onChange={(e) => setFormData({ ...formData, pemKey: e.target.value })}
              placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
              rows={6}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              required
            />
          </div>
        )}
      </div>

      {/* Cluster Details */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <h3 className="font-semibold text-slate-900">Cluster Details</h3>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Cluster Name *
          </label>
          <input
            type="text"
            value={formData.clusterName}
            onChange={(e) => setFormData({ ...formData, clusterName: e.target.value })}
            placeholder="production-cluster-1"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Description (Optional)
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Production cluster for main application"
            rows={2}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.installKyverno}
            onChange={(e) => setFormData({ ...formData, installKyverno: e.target.checked })}
            className="text-emerald-600 focus:ring-emerald-500 rounded"
          />
          <span className="text-sm text-slate-700">
            Install Kyverno automatically (Recommended)
          </span>
        </label>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={() => setFormData({
            host: '',
            username: '',
            authMethod: 'password',
            password: '',
            pemKey: '',
            port: '22',
            clusterName: '',
            description: '',
            installKyverno: true,
          })}
          className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          disabled={loading}
        >
          Reset
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Connect & Setup
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// Kubeconfig Upload Form
function KubeconfigForm({ loading, setLoading, setError, setSuccess, onSuccess }: any) {
  const [formData, setFormData] = useState({
    name: '',
    kubeconfigContent: '',
    context: '',
    description: '',
    skipTlsVerify: true,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // First, test the connection
      const connectResponse = await connectClusterViaKubeconfig({
        kubeconfig_content: formData.kubeconfigContent,
        context: formData.context || undefined,
        skip_tls_verify: formData.skipTlsVerify,
      });

      if (connectResponse.error || !connectResponse.data?.success) {
        throw new Error(connectResponse.error || 'Failed to connect with kubeconfig');
      }

      // If skip TLS is on, patch the kubeconfig before saving so future operations also skip TLS
      let kubeconfigToSave = formData.kubeconfigContent;
      if (formData.skipTlsVerify) {
        try {
          // Parse and patch the YAML properly
          const lines = kubeconfigToSave.split('\n');
          const patched: string[] = [];
          let skipNextCaLine = false;
          for (const line of lines) {
            // Remove certificate-authority-data / certificate-authority lines
            if (/^\s+certificate-authority(-data)?:/.test(line)) {
              continue;
            }
            patched.push(line);
            // After the "server:" line, insert insecure-skip-tls-verify
            if (/^\s+server:\s/.test(line) && !skipNextCaLine) {
              const indent = line.match(/^(\s+)/)?.[1] || '      ';
              patched.push(`${indent}insecure-skip-tls-verify: true`);
              skipNextCaLine = true;
            }
          }
          kubeconfigToSave = patched.join('\n');
        } catch {
          // If patching fails, save as-is
        }
      }

      // If successful, create cluster in database
      const createResponse = await createCluster({
        name: formData.name,
        kubeconfig_content: kubeconfigToSave,
        context: formData.context || undefined,
        description: formData.description || undefined,
      });

      if (createResponse.error) {
        throw new Error(createResponse.error);
      }

      setSuccess(`Cluster "${formData.name}" added successfully!`);
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Upload className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium mb-1">Kubeconfig Direct Upload</p>
            <p className="text-blue-700">
              Paste your kubeconfig YAML content directly. Useful for quick local connections
              or when you already have a kubeconfig file.
            </p>
          </div>
        </div>
      </div>

      {/* Port Requirement Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium mb-1">Network Requirements</p>
            <ul className="text-amber-700 list-disc list-inside space-y-1">
              <li>Use the <strong>Public IP</strong> of your Kubernetes master node in the kubeconfig <code className="bg-amber-100 px-1 rounded">server</code> field (e.g. <code className="bg-amber-100 px-1 rounded">https://&lt;PUBLIC_IP&gt;:6443</code>)</li>
              <li>Open port <strong>6443</strong> (Kubernetes API server) on your firewall / security group</li>
              <li>If using a custom API port, open that port instead</li>
            </ul>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Cluster Name *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="my-cluster"
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Kubeconfig Content *
        </label>
        <textarea
          value={formData.kubeconfigContent}
          onChange={(e) => setFormData({ ...formData, kubeconfigContent: e.target.value })}
          placeholder="apiVersion: v1&#10;kind: Config&#10;clusters:&#10;- cluster:&#10;    server: https://<PUBLIC_IP>:6443&#10;    ..."
          rows={12}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          required
        />
        <p className="mt-2 text-xs text-slate-500">
          Paste the complete YAML content from your kubeconfig file (~/.kube/config).
          Make sure the <strong>server URL uses your Public IP</strong> and port <strong>6443</strong> is open.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Context (Optional)
        </label>
        <input
          type="text"
          value={formData.context}
          onChange={(e) => setFormData({ ...formData, context: e.target.value })}
          placeholder="Leave empty to use default context"
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Description (Optional)
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Development cluster"
          rows={2}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.skipTlsVerify}
            onChange={(e) => setFormData({ ...formData, skipTlsVerify: e.target.checked })}
            className="text-emerald-600 focus:ring-emerald-500 rounded"
          />
          <span className="text-sm text-slate-700">
            Skip TLS certificate verification
          </span>
        </label>
        <p className="text-xs text-slate-500 ml-6">
          Enable this if connecting via <strong>Public IP</strong> that is not in the cluster&apos;s TLS certificate SANs.
          Common when the K8s API cert was generated with only the internal IP.
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={() => setFormData({
            name: '',
            kubeconfigContent: '',
            context: '',
            description: '',
            skipTlsVerify: true,
          })}
          className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          disabled={loading}
        >
          Clear
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Add Cluster
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// Token-based Form
function TokenForm({ loading, setLoading, setError, setSuccess, onSuccess }: any) {
  const [formData, setFormData] = useState({
    name: '',
    serverUrl: '',
    token: '',
    caCertData: '',
    description: '',
    verifySsl: false,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // First, test the connection
      const connectResponse = await connectClusterViaToken({
        server_url: formData.serverUrl,
        token: formData.token,
        ca_cert_data: formData.caCertData || undefined,
      });

      if (connectResponse.error || !connectResponse.data?.success) {
        throw new Error(connectResponse.error || 'Failed to connect with token');
      }

      // If successful, create cluster in database
      const createResponse = await createCluster({
        name: formData.name,
        host: new URL(formData.serverUrl).hostname,
        description: formData.description || undefined,
      });

      if (createResponse.error) {
        throw new Error(createResponse.error);
      }

      setSuccess(`Cluster "${formData.name}" added successfully!`);
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Key className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium mb-1">Service Account Token</p>
            <p className="text-blue-700">
              Connect using a Kubernetes service account token. More secure than full kubeconfig
              as you can limit RBAC permissions.
            </p>
          </div>
        </div>
      </div>

      {/* Port Requirement Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium mb-1">Network Requirements</p>
            <ul className="text-amber-700 list-disc list-inside space-y-1">
              <li>Use the <strong>Public IP</strong> of your Kubernetes master node in the Server URL (e.g. <code className="bg-amber-100 px-1 rounded">https://&lt;PUBLIC_IP&gt;:6443</code>)</li>
              <li>Open port <strong>6443</strong> (Kubernetes API server) on your firewall / security group</li>
              <li>If using a custom API port, open that port instead</li>
            </ul>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Cluster Name *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="my-cluster"
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Kubernetes API Server URL * <span className="text-xs text-amber-600 font-normal">(Use Public IP, port 6443 must be open)</span>
        </label>
        <input
          type="url"
          value={formData.serverUrl}
          onChange={(e) => setFormData({ ...formData, serverUrl: e.target.value })}
          placeholder="https://<PUBLIC_IP>:6443"
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Service Account Token *
        </label>
        <textarea
          value={formData.token}
          onChange={(e) => setFormData({ ...formData, token: e.target.value })}
          placeholder="eyJhbGciOiJSUzI1NiIsImtpZCI6..."
          rows={4}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          CA Certificate (Base64) (Optional)
        </label>
        <textarea
          value={formData.caCertData}
          onChange={(e) => setFormData({ ...formData, caCertData: e.target.value })}
          placeholder="LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t..."
          rows={3}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
        <p className="mt-2 text-xs text-slate-500">
          Required for SSL verification. Leave empty if using insecure-skip-tls-verify.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Description (Optional)
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Production cluster"
          rows={2}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.verifySsl}
          onChange={(e) => setFormData({ ...formData, verifySsl: e.target.checked })}
          className="text-emerald-600 focus:ring-emerald-500 rounded"
        />
        <span className="text-sm text-slate-700">
          Verify SSL certificates (requires CA certificate)
        </span>
      </label>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={() => setFormData({
            name: '',
            serverUrl: '',
            token: '',
            caCertData: '',
            description: '',
            verifySsl: false,
          })}
          className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          disabled={loading}
        >
          Clear
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Add Cluster
            </>
          )}
        </button>
      </div>
    </form>
  );
}
