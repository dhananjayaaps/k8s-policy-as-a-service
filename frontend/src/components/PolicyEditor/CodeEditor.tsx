'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Maximize2, X, Save } from 'lucide-react';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidate?: (isValid: boolean, errors: string[]) => void;
  readOnly?: boolean;
  /** Render as an inline editor (dark, with line numbers) instead of the click-to-fullscreen preview */
  inline?: boolean;
  height?: string;
}

export default function CodeEditor({
  value,
  onChange,
  onValidate,
  readOnly = false,
  inline = false,
  height = '100%',
}: CodeEditorProps) {
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLTextAreaElement>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isValid, setIsValid] = useState(true);
  const [fontSize, setFontSize] = useState(14);

  useEffect(() => {
    setEditValue(value);
    validateYAML(value);
  }, [value]);

  const validateYAML = (yamlContent: string) => {
    if (!yamlContent.trim()) {
      setValidationErrors([]);
      setIsValid(true);
      onValidate?.(true, []);
      return;
    }

    try {
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Insert 2 spaces for tab
      const newValue =
        editValue.substring(0, start) +
        '  ' +
        editValue.substring(end);

      setEditValue(newValue);
      validateYAML(newValue);

      // Set cursor position after inserted spaces
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handleOpenFullscreen = () => {
    setEditValue(value);
    setShowFullscreen(true);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  };

  const handleSave = () => {
    onChange(editValue);
    setShowFullscreen(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setShowFullscreen(false);
  };

  const lineCount = editValue.split('\n').length;

  // ── Inline mode (always-visible editor with line numbers) ──
  if (inline) {
    const inlineLineCount = value.split('\n').length;
    const handleInlineKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newVal = value.substring(0, start) + '  ' + value.substring(end);
        onChange(newVal);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        }, 0);
      }
    };

    return (
      <div className="flex flex-col rounded-lg overflow-hidden border border-slate-700" style={{ height }}>
        <div className="flex-1 flex overflow-hidden">
          {/* Line numbers */}
          <div
            className="bg-slate-800 text-slate-500 text-right py-3 pr-3 pl-3 select-none overflow-y-hidden border-r border-slate-700 flex-shrink-0"
            style={{ fontSize: '13px', lineHeight: '1.6' }}
          >
            {Array.from({ length: inlineLineCount }, (_, i) => (
              <div key={i + 1} className="font-mono" style={{ height: `${13 * 1.6}px` }}>
                {i + 1}
              </div>
            ))}
          </div>
          {/* Editor */}
          <textarea
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              validateYAML(e.target.value);
            }}
            onKeyDown={handleInlineKeyDown}
            readOnly={readOnly}
            className="flex-1 px-4 py-3 font-mono text-[13px] text-slate-100 bg-slate-900 resize-none focus:outline-none overflow-y-auto"
            style={{ tabSize: 2, lineHeight: '1.6' }}
            spellCheck={false}
          />
        </div>
      </div>
    );
  }

  // ── Default mode (preview + click-to-fullscreen) ──
  return (
    <>
      {/* Preview/Click area */}
      <div 
        onClick={handleOpenFullscreen}
        className="relative cursor-pointer group"
      >
        <textarea
          ref={previewRef}
          value={value}
          readOnly
          className="w-full h-[200px] px-4 py-3 font-mono text-sm text-slate-800 bg-slate-50 border border-slate-300 rounded-lg resize-none focus:outline-none cursor-pointer"
          style={{
            tabSize: 2,
            lineHeight: '1.5',
          }}
          spellCheck={false}
        />
        <div className="absolute inset-0 bg-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-lg flex items-center justify-center">
          <div className="bg-violet-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <Maximize2 className="w-4 h-4" />
            <span className="text-sm font-medium">Click to open full editor</span>
          </div>
        </div>
      </div>

      {/* Fullscreen Modal */}
      {showFullscreen && (
        <div className="fixed inset-0 bg-slate-900 z-[100] flex flex-col">
          {/* Header */}
          <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold text-white">YAML Editor</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFontSize(Math.max(10, fontSize - 1))}
                  className="px-2.5 py-1 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                  type="button"
                >
                  A-
                </button>
                <span className="text-sm text-slate-400">{fontSize}px</span>
                <button
                  onClick={() => setFontSize(Math.min(24, fontSize + 1))}
                  className="px-2.5 py-1 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                  type="button"
                >
                  A+
                </button>
              </div>
              <div className="text-sm text-slate-400">
                {lineCount} lines
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isValid ? (
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">Valid YAML</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">{validationErrors.length} error(s)</span>
                </div>
              )}
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          </div>

          {/* Editor Area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Line numbers */}
            <div 
              className="bg-slate-800 text-slate-500 text-right py-4 pr-4 pl-4 select-none overflow-y-hidden border-r border-slate-700"
              style={{ fontSize: `${fontSize}px`, lineHeight: '1.6' }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i + 1} className="font-mono" style={{ height: `${fontSize * 1.6}px` }}>
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Text area */}
            <textarea
              ref={textareaRef}
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                validateYAML(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              readOnly={readOnly}
              className="flex-1 px-6 py-4 font-mono text-slate-100 bg-slate-900 resize-none focus:outline-none overflow-y-auto"
              style={{
                tabSize: 2,
                lineHeight: '1.6',
                fontSize: `${fontSize}px`,
              }}
              spellCheck={false}
            />
          </div>

          {/* Footer with errors */}
          {validationErrors.length > 0 && (
            <div className="bg-red-900/30 border-t border-red-800 px-6 py-4 max-h-40 overflow-y-auto">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-red-300 mb-2">Validation Errors:</div>
                  <ul className="text-sm text-red-200 space-y-1">
                    {validationErrors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
