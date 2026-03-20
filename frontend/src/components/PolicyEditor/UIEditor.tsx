'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface PolicyParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  value: any;
  description?: string;
  required?: boolean;
}

interface UIEditorProps {
  yaml: string;
  parameters: Record<string, any>;
  onParametersChange: (parameters: Record<string, any>) => void;
}

export default function UIEditor({ yaml, parameters, onParametersChange }: UIEditorProps) {
  const [extractedParams, setExtractedParams] = useState<PolicyParameter[]>([]);
  const [localParams, setLocalParams] = useState<Record<string, any>>(parameters);

  useEffect(() => {
    // Extract parameters from YAML template
    // Look for patterns like {{ parameter_name }} or ${parameter_name}
    const params = extractParameters(yaml);
    setExtractedParams(params);
  }, [yaml]);

  useEffect(() => {
    setLocalParams(parameters);
  }, [parameters]);

  const extractParameters = (yamlContent: string): PolicyParameter[] => {
    const paramPattern = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
    const matches = yamlContent.matchAll(paramPattern);
    const paramSet = new Set<string>();
    const params: PolicyParameter[] = [];

    for (const match of matches) {
      const paramName = match[1];
      if (!paramSet.has(paramName)) {
        paramSet.add(paramName);
        
        // Infer type from context or default to string
        let type: PolicyParameter['type'] = 'string';
        const context = yamlContent.substring(Math.max(0, match.index! - 50), match.index! + 50);
        
        if (context.includes('replicas:') || context.includes('count:') || context.includes('limit:')) {
          type = 'number';
        } else if (context.includes('enabled:') || context.includes('enforce:')) {
          type = 'boolean';
        }

        params.push({
          name: paramName,
          type,
          value: localParams[paramName] !== undefined ? localParams[paramName] : getDefaultValue(type),
          required: true,
        });
      }
    }

    return params;
  };

  const getDefaultValue = (type: PolicyParameter['type']): any => {
    switch (type) {
      case 'string':
        return '';
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return '';
    }
  };

  const handleParameterChange = (paramName: string, value: any) => {
    const newParams = { ...localParams, [paramName]: value };
    setLocalParams(newParams);
    onParametersChange(newParams);
  };

  const renderParameterInput = (param: PolicyParameter) => {
    switch (param.type) {
      case 'boolean':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={localParams[param.name] || false}
              onChange={(e) => handleParameterChange(param.name, e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-sm text-slate-700">Enabled</span>
          </label>
        );

      case 'number':
        return (
          <input
            type="number"
            value={localParams[param.name] ?? ''}
            onChange={(e) => handleParameterChange(param.name, parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder={`Enter ${param.name}`}
          />
        );

      case 'array':
        return (
          <textarea
            value={Array.isArray(localParams[param.name]) ? localParams[param.name].join('\n') : ''}
            onChange={(e) => handleParameterChange(param.name, e.target.value.split('\n').filter(v => v.trim()))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
            placeholder="One value per line"
            rows={3}
          />
        );

      default: // string
        return (
          <input
            type="text"
            value={localParams[param.name] || ''}
            onChange={(e) => handleParameterChange(param.name, e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder={`Enter ${param.name}`}
          />
        );
    }
  };

  if (extractedParams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <AlertCircle className="w-12 h-12 text-slate-400 mb-4" />
        <h3 className="text-lg font-semibold text-slate-900 mb-2">No Parameters Found</h3>
        <p className="text-sm text-slate-600 max-w-md">
          This policy template doesn't contain any parameters. Use the code editor to modify the YAML directly, 
          or add parameters using the <code className="px-1 py-0.5 bg-slate-100 rounded text-xs">{'{{ parameter_name }}'}</code> syntax.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 px-2">
        <span className="text-xs font-medium text-slate-600">Visual Editor</span>
        <p className="text-xs text-slate-500 mt-1">
          Configure {extractedParams.length} parameter{extractedParams.length !== 1 ? 's' : ''} found in the policy template
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 px-2">
          {extractedParams.map((param) => (
            <div key={param.name} className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-900">
                  {param.name}
                  {param.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                  {param.type}
                </span>
              </div>
              {param.description && (
                <p className="text-xs text-slate-600 mb-2">{param.description}</p>
              )}
              {renderParameterInput(param)}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-800">
            Changes made here will automatically sync with the code editor. 
            Use <code className="px-1 py-0.5 bg-blue-100 rounded">{'{{ param_name }}'}</code> in YAML to create new parameters.
          </p>
        </div>
      </div>
    </div>
  );
}
