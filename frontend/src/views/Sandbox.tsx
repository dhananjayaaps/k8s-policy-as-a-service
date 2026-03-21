'use client';

import { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  FileCode,
  Shield,
  ChevronDown,
  SkipForward,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import CodeEditor from '../components/PolicyEditor/CodeEditor';
import { getPolicies, validatePolicy, testPolicyAgainstResource } from '../lib/api';
import type { Policy } from '../types';

type RuleResult = {
  rule_name: string;
  matched: boolean;
  status: 'pass' | 'fail' | 'skip' | 'warn';
  message: string;
  action_type: string | null;
};

type TestResults = {
  success: boolean;
  policy_valid: boolean;
  resource_valid: boolean;
  policy_errors: string[];
  resource_errors: string[];
  results: RuleResult[];
  summary: { pass: number; fail: number; skip: number; warn: number };
};

const DEFAULT_POLICY = `apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-latest-tag
spec:
  validationFailureAction: Enforce
  rules:
  - name: validate-image-tag
    match:
      any:
      - resources:
          kinds:
          - Pod
          - Deployment
          - StatefulSet
          - DaemonSet
    validate:
      message: "Using the 'latest' image tag is not allowed."
      pattern:
        spec:
          =(template):
            spec:
              containers:
              - image: "!*:latest"`;

const DEFAULT_RESOURCE = `apiVersion: apps/v1
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
        - containerPort: 80`;

export default function Sandbox() {
  const [policyYaml, setPolicyYaml] = useState(DEFAULT_POLICY);
  const [resourceYaml, setResourceYaml] = useState(DEFAULT_RESOURCE);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [dbPolicies, setDbPolicies] = useState<Policy[]>([]);
  const [showPolicyDropdown, setShowPolicyDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<'policy' | 'resource'>('policy');

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    const res = await getPolicies();
    if (res.data) {
      setDbPolicies(res.data.filter((p) => p.yaml_template));
    }
  };

  const handleLoadPolicy = (policy: Policy) => {
    if (policy.yaml_template) {
      setPolicyYaml(policy.yaml_template);
    }
    setShowPolicyDropdown(false);
    setTestResults(null);
    setValidationResult(null);
  };

  const handleValidatePolicy = async () => {
    setValidating(true);
    setTestResults(null);
    try {
      const res = await validatePolicy(policyYaml);
      if (res.data) {
        setValidationResult({
          valid: res.data.valid,
          errors: res.data.errors,
          warnings: res.data.warnings,
        });
      } else {
        setValidationResult({
          valid: false,
          errors: [res.error || 'Validation request failed'],
          warnings: [],
        });
      }
    } catch {
      setValidationResult({
        valid: false,
        errors: ['Failed to connect to validation service'],
        warnings: [],
      });
    }
    setValidating(false);
  };

  const handleTestResource = async () => {
    setLoading(true);
    setValidationResult(null);
    try {
      const res = await testPolicyAgainstResource(policyYaml, resourceYaml);
      if (res.data) {
        setTestResults(res.data);
      } else {
        setTestResults({
          success: false,
          policy_valid: false,
          resource_valid: false,
          policy_errors: [res.error || 'Test request failed'],
          resource_errors: [],
          results: [],
          summary: { pass: 0, fail: 0, skip: 0, warn: 0 },
        });
      }
    } catch {
      setTestResults({
        success: false,
        policy_valid: false,
        resource_valid: false,
        policy_errors: ['Failed to connect to test service'],
        resource_errors: [],
        results: [],
        summary: { pass: 0, fail: 0, skip: 0, warn: 0 },
      });
    }
    setLoading(false);
  };

  const handleReset = () => {
    setPolicyYaml(DEFAULT_POLICY);
    setResourceYaml(DEFAULT_RESOURCE);
    setTestResults(null);
    setValidationResult(null);
  };

  const statusConfig = {
    pass: {
      icon: CheckCircle,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      label: 'Pass',
    },
    fail: {
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
      label: 'Fail',
    },
    warn: {
      icon: AlertCircle,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      label: 'Warning',
    },
    skip: {
      icon: SkipForward,
      color: 'text-slate-500',
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      label: 'Skipped',
    },
  };

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Policy Sandbox</h1>
          <p className="text-sm text-slate-500 mt-1">
            Write or load Kyverno policies, test them against Kubernetes resources
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-2 text-sm text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleValidatePolicy}
            disabled={validating || !policyYaml.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {validating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            Validate Policy
          </button>
          <button
            onClick={handleTestResource}
            disabled={loading || !policyYaml.trim() || !resourceYaml.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Test Against Resource
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-5 min-h-0">
        {/* Left: Editors */}
        <div className="flex flex-col min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Tab headers */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('policy')}
              className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'policy'
                  ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Shield className="w-4 h-4" />
              Kyverno Policy
            </button>
            <button
              onClick={() => setActiveTab('resource')}
              className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'resource'
                  ? 'text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <FileCode className="w-4 h-4" />
              K8s Resource
            </button>
          </div>

          {/* Policy editor */}
          <div className={`flex-1 flex flex-col p-4 min-h-0 ${activeTab !== 'policy' ? 'hidden' : ''}`}>
            {/* Load from DB */}
            <div className="mb-3 relative">
              <button
                onClick={() => setShowPolicyDropdown(!showPolicyDropdown)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 flex items-center gap-1"
              >
                Load from saved policies
                <ChevronDown className="w-3 h-3" />
              </button>
              {showPolicyDropdown && (
                <div className="absolute top-full left-0 mt-1 w-80 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                  {dbPolicies.length === 0 ? (
                    <div className="p-3 text-sm text-slate-500">No policies found</div>
                  ) : (
                    dbPolicies.map((p) => (
                      <button
                        key={String(p.id)}
                        onClick={() => handleLoadPolicy(p)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                      >
                        <div className="text-sm font-medium text-slate-800">{p.title || p.name}</div>
                        <div className="text-xs text-slate-500 truncate">
                          {p.category && <span className="mr-2">{p.category}</span>}
                          {p.severity && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs ${
                                p.severity === 'high'
                                  ? 'bg-red-100 text-red-700'
                                  : p.severity === 'medium'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {p.severity}
                            </span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0">
              <CodeEditor
                value={policyYaml}
                onChange={setPolicyYaml}
                height="100%"
              />
            </div>
          </div>

          {/* Resource editor */}
          <div className={`flex-1 flex flex-col p-4 min-h-0 ${activeTab !== 'resource' ? 'hidden' : ''}`}>
            <p className="text-xs text-slate-500 mb-3">
              Paste the Kubernetes manifest you want to test against the policy above
            </p>
            <div className="flex-1 min-h-0">
              <CodeEditor
                value={resourceYaml}
                onChange={setResourceYaml}
                height="100%"
              />
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="flex flex-col min-h-0 space-y-4 overflow-y-auto">
          {/* Validation Results */}
          {validationResult && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-base font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Policy Validation
              </h2>
              {validationResult.valid ? (
                <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-emerald-900">Policy is valid</div>
                    <p className="text-sm text-emerald-700">
                      The policy structure and syntax are correct.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {validationResult.errors.map((err, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200"
                    >
                      <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-red-800">{err}</span>
                    </div>
                  ))}
                </div>
              )}
              {validationResult.warnings.length > 0 && (
                <div className="mt-2 space-y-2">
                  {validationResult.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200"
                    >
                      <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-amber-800">{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Test Results */}
          {testResults && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Play className="w-4 h-4" />
                Test Results
              </h2>

              {/* Parse errors */}
              {testResults.policy_errors.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">
                    Policy Errors
                  </div>
                  {testResults.policy_errors.map((err, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 p-2.5 mb-1 bg-red-50 rounded-lg border border-red-200"
                    >
                      <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-red-800">{err}</span>
                    </div>
                  ))}
                </div>
              )}
              {testResults.resource_errors.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">
                    Resource Errors
                  </div>
                  {testResults.resource_errors.map((err, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 p-2.5 mb-1 bg-red-50 rounded-lg border border-red-200"
                    >
                      <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-red-800">{err}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary badges */}
              {testResults.results.length > 0 && (
                <>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {(['pass', 'fail', 'warn', 'skip'] as const).map((status) => {
                      const cfg = statusConfig[status];
                      return (
                        <div
                          key={status}
                          className={`p-2.5 rounded-lg border ${cfg.bg} ${cfg.border} text-center`}
                        >
                          <div className="text-xs text-slate-600 mb-0.5">{cfg.label}</div>
                          <div className={`text-xl font-bold ${cfg.color}`}>
                            {testResults.summary[status] || 0}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Per-rule results */}
                  <div className="space-y-2">
                    {testResults.results.map((rule, i) => {
                      const cfg = statusConfig[rule.status];
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={i}
                          className={`p-3.5 rounded-lg border ${cfg.bg} ${cfg.border}`}
                        >
                          <div className="flex items-start gap-3">
                            <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-semibold text-slate-900 text-sm">
                                  {rule.rule_name}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.color} border ${cfg.border}`}
                                >
                                  {cfg.label}
                                </span>
                                {rule.action_type && (
                                  <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-medium text-slate-600">
                                    {rule.action_type}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-slate-600">{rule.message}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {testResults.results.length === 0 &&
                testResults.policy_errors.length === 0 &&
                testResults.resource_errors.length === 0 && (
                  <div className="text-sm text-slate-500 text-center py-4">
                    No rules matched the provided resource.
                  </div>
                )}
            </div>
          )}

          {/* Empty state */}
          {!testResults && !validationResult && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex flex-col items-center justify-center text-center flex-1">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="font-semibold text-slate-700 mb-2">
                Ready to test
              </h3>
              <p className="text-sm text-slate-500 max-w-sm">
                Write or load a Kyverno policy on the left, add a K8s resource YAML, then
                click <strong>Test Against Resource</strong> to see rule-by-rule results.
              </p>
              <div className="mt-5 space-y-2 text-left text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    1
                  </span>
                  Write or load a Kyverno policy
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    2
                  </span>
                  Paste a K8s resource to test against
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                    3
                  </span>
                  Click Test or Validate to see results
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
