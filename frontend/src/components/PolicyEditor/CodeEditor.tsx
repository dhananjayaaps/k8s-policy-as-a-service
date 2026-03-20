'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidate?: (isValid: boolean, errors: string[]) => void;
  readOnly?: boolean;
  height?: string;
}

export default function CodeEditor({
  value,
  onChange,
  onValidate,
  readOnly = false,
  height = '500px'
}: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localValue, setLocalValue] = useState(value);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    setLocalValue(value);
    validateYAML(value);
  }, [value]);

  const validateYAML = async (yamlContent: string) => {
    if (!yamlContent.trim()) {
      setValidationErrors([]);
      setIsValid(true);
      onValidate?.(true, []);
      return;
    }

    try {
      // Basic YAML syntax check (client-side)
      // You can enhance this with a YAML parser library
      const lines = yamlContent.split('\n');
      const errors: string[] = [];

      // Check for basic indentation issues
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().length === 0) continue;

        const leadingSpaces = line.match(/^\s*/)?.[0].length || 0;
        if (leadingSpaces % 2 !== 0 && line.trim().length > 0) {
          errors.push(`Line ${i + 1}: Inconsistent indentation (should be multiple of 2)`);
        }
      }

      // Check for required Kyverno fields
      if (!yamlContent.includes('apiVersion:')) {
        errors.push('Missing required field: apiVersion');
      }
      if (!yamlContent.includes('kind:')) {
        errors.push('Missing required field: kind');
      }
      if (!yamlContent.includes('metadata:')) {
        errors.push('Missing required field: metadata');
      }
      if (!yamlContent.includes('spec:')) {
        errors.push('Missing required field: spec');
      }

      setValidationErrors(errors);
      const valid = errors.length === 0;
      setIsValid(valid);
      onValidate?.(valid, errors);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Invalid YAML syntax';
      setValidationErrors([errorMsg]);
      setIsValid(false);
      onValidate?.(false, [errorMsg]);
    }
  };

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    onChange(newValue);
    validateYAML(newValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Insert 2 spaces for tab
      const newValue =
        localValue.substring(0, start) +
        '  ' +
        localValue.substring(end);

      setLocalValue(newValue);
      onChange(newValue);

      // Set cursor position after inserted spaces
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 px-2">
        <span className="text-xs font-medium text-slate-600">YAML Editor</span>
        {isValid ? (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle className="w-3 h-3" />
            <span>Valid</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-red-600">
            <AlertCircle className="w-3 h-3" />
            <span>{validationErrors.length} error(s)</span>
          </div>
        )}
      </div>

      <div
        ref={editorRef}
        className="flex-1 border border-slate-300 rounded-lg overflow-hidden bg-slate-900"
        style={{ height }}
      >
        <textarea
          ref={textareaRef}
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          className="w-full h-full p-4 font-mono text-sm text-slate-50 bg-slate-900 resize-none focus:outline-none"
          style={{
            tabSize: 2,
            lineHeight: '1.6',
          }}
          spellCheck={false}
        />
      </div>

      {validationErrors.length > 0 && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium text-red-900 mb-1">Validation Errors:</div>
              <ul className="text-xs text-red-700 space-y-1">
                {validationErrors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
