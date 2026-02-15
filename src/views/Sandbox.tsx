'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

type ValidationResult = {
  policy: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  category: string;
};

export default function Sandbox() {
  const [yamlContent, setYamlContent] = useState(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-app
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        ports:
        - containerPort: 80`);

  const [results, setResults] = useState<ValidationResult[]>([
    {
      policy: 'Disallow Root Containers',
      status: 'fail',
      message: 'Container is running as root user. Add securityContext with runAsNonRoot: true',
      category: 'SECURITY'
    },
    {
      policy: 'Block Latest Tag',
      status: 'fail',
      message: 'Image tag "latest" is not allowed. Please specify an explicit version tag.',
      category: 'RELIABILITY'
    },
    {
      policy: 'Require Resource Limits',
      status: 'warn',
      message: 'Missing CPU and memory limits. This may lead to unexpected costs.',
      category: 'COST'
    },
    {
      policy: 'Disallow Default Namespace',
      status: 'fail',
      message: 'Deployment to default namespace is not allowed. Use a project-specific namespace.',
      category: 'GOVERNANCE'
    }
  ]);

  const validateYAML = () => {
    const hasLatestTag = yamlContent.includes(':latest');
    const hasSecurityContext = yamlContent.includes('securityContext');
    const hasResourceLimits = yamlContent.includes('resources:');
    const usesDefaultNamespace = yamlContent.includes('namespace: default') ||
                                  !yamlContent.includes('namespace:');

    const newResults: ValidationResult[] = [];

    if (!hasSecurityContext) {
      newResults.push({
        policy: 'Disallow Root Containers',
        status: 'fail',
        message: 'Container is running as root user. Add securityContext with runAsNonRoot: true',
        category: 'SECURITY'
      });
    } else {
      newResults.push({
        policy: 'Disallow Root Containers',
        status: 'pass',
        message: 'Security context properly configured',
        category: 'SECURITY'
      });
    }

    if (hasLatestTag) {
      newResults.push({
        policy: 'Block Latest Tag',
        status: 'fail',
        message: 'Image tag "latest" is not allowed. Please specify an explicit version tag.',
        category: 'RELIABILITY'
      });
    } else {
      newResults.push({
        policy: 'Block Latest Tag',
        status: 'pass',
        message: 'Image tag is properly versioned',
        category: 'RELIABILITY'
      });
    }

    if (!hasResourceLimits) {
      newResults.push({
        policy: 'Require Resource Limits',
        status: 'warn',
        message: 'Missing CPU and memory limits. This may lead to unexpected costs.',
        category: 'COST'
      });
    }

    if (usesDefaultNamespace) {
      newResults.push({
        policy: 'Disallow Default Namespace',
        status: 'fail',
        message: 'Deployment to default namespace is not allowed. Use a project-specific namespace.',
        category: 'GOVERNANCE'
      });
    }

    setResults(newResults);
  };

  const statusConfig = {
    pass: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    fail: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
    warn: { icon: AlertCircle, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  };

  const failCount = results.filter(r => r.status === 'fail').length;
  const warnCount = results.filter(r => r.status === 'warn').length;
  const passCount = results.filter(r => r.status === 'pass').length;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Policy Sandbox</h1>
        <p className="text-slate-600">Test your Kubernetes manifests against active policies before deployment</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Paste Your YAML Here</h2>
            <button
              onClick={validateYAML}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
            >
              Validate
            </button>
          </div>
          <textarea
            value={yamlContent}
            onChange={(e) => setYamlContent(e.target.value)}
            className="w-full h-[600px] p-4 font-mono text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            spellCheck={false}
          />
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Validation Results</h2>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <div className="text-xs text-slate-600 mb-1">Passed</div>
                <div className="text-2xl font-bold text-emerald-600">{passCount}</div>
              </div>
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <div className="text-xs text-slate-600 mb-1">Failed</div>
                <div className="text-2xl font-bold text-red-600">{failCount}</div>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="text-xs text-slate-600 mb-1">Warnings</div>
                <div className="text-2xl font-bold text-yellow-600">{warnCount}</div>
              </div>
            </div>

            <div className="space-y-3">
              {results.map((result, index) => {
                const config = statusConfig[result.status];
                const Icon = config.icon;
                return (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border ${config.bg} ${config.border}`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={`w-5 h-5 mt-0.5 ${config.color}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-slate-900">{result.policy}</span>
                          <span className="px-2 py-0.5 bg-white rounded text-xs font-medium text-slate-600">
                            {result.category}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600">{result.message}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Instant Feedback</h3>
            <p className="text-sm text-blue-800">
              Modify your YAML on the left and click Validate to see real-time policy checks.
              Fix all failures before deploying to your cluster.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
