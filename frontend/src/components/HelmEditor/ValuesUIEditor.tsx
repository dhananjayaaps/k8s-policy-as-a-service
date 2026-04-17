'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import * as yaml from 'js-yaml';
import { ChevronDown, ChevronRight, Plus, Trash2, AlertCircle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Primitive = string | number | boolean | null;

interface Props {
  yamlStr: string;
  onChange: (updated: string) => void;
  readOnly?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getType(v: unknown): 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array' {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'object') return 'object';
  return 'string';
}

function dumpYaml(obj: Record<string, unknown>): string {
  return yaml.dump(obj, { indent: 2, lineWidth: -1, noRefs: true });
}

// ── Small field components ────────────────────────────────────────────────────

function Toggle({ value, onChange, readOnly }: { value: boolean; onChange: (v: boolean) => void; readOnly?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !readOnly && onChange(!value)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none
        ${value ? 'bg-sky-500' : 'bg-slate-300'}
        ${readOnly ? 'cursor-default opacity-60' : 'cursor-pointer hover:opacity-90'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
          ${value ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}
      />
    </button>
  );
}

function StringField({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  const multiline = value.includes('\n') || value.length > 80;
  const base =
    'w-full px-2.5 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-400 font-mono bg-white disabled:bg-slate-50';

  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
        rows={Math.min(value.split('\n').length + 1, 6)}
        className={`${base} resize-y`}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly}
      className={base}
    />
  );
}

function NumberField({
  value,
  onChange,
  readOnly,
}: {
  value: number;
  onChange: (v: number) => void;
  readOnly?: boolean;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={readOnly}
      className="w-36 px-2.5 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-400 font-mono bg-white disabled:bg-slate-50"
    />
  );
}

function ArrayPrimitivesField({
  items,
  onChange,
  readOnly,
}: {
  items: Primitive[];
  onChange: (v: Primitive[]) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center py-0.5">
      {items.map((item, idx) => (
        <div
          key={idx}
          className="flex items-center gap-0.5 bg-slate-100 border border-slate-200 rounded-full pl-2.5 pr-1 py-0.5"
        >
          <input
            type="text"
            value={String(item ?? '')}
            disabled={readOnly}
            onChange={(e) => {
              const next = [...items];
              next[idx] = e.target.value;
              onChange(next);
            }}
            className="text-xs font-mono bg-transparent border-none outline-none"
            style={{ width: `${Math.max(String(item ?? '').length * 7 + 4, 32)}px` }}
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="text-slate-400 hover:text-red-500 ml-0.5 leading-none"
              title="Remove"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() => onChange([...items, ''])}
          className="flex items-center gap-0.5 px-2.5 py-0.5 text-xs bg-sky-50 text-sky-600 rounded-full hover:bg-sky-100 border border-sky-200 font-medium"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      )}
    </div>
  );
}

// ── Recursive node renderer ───────────────────────────────────────────────────

interface NodeProps {
  path: (string | number)[];
  label: string;
  value: unknown;
  depth: number;
  readOnly?: boolean;
  onUpdate: (path: (string | number)[], value: unknown) => void;
}

function RenderNode({ path, label, value, depth, readOnly, onUpdate }: NodeProps) {
  const [open, setOpen] = useState(depth < 1);
  const t = getType(value);

  // ── Object section ────────────────────────────────────────────────────────
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const indent = depth * 16;

    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 w-full text-left py-2 group"
          style={{ paddingLeft: `${indent}px` }}
        >
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          )}
          <span
            className={`font-mono font-semibold group-hover:text-sky-700 transition-colors ${
              depth === 0 ? 'text-slate-800 text-sm' : 'text-slate-600 text-xs'
            }`}
          >
            {label}:
          </span>
          <span className="text-xs text-slate-400">{keys.length} {keys.length === 1 ? 'key' : 'keys'}</span>
        </button>

        {open && (
          <div
            className="border-l-2 border-slate-100"
            style={{ marginLeft: `${indent + 7}px` }}
          >
            {keys.map((k) => (
              <RenderNode
                key={k}
                path={[...path, k]}
                label={k}
                value={obj[k]}
                depth={depth + 1}
                readOnly={readOnly}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Array ─────────────────────────────────────────────────────────────────
  if (t === 'array') {
    const arr = value as unknown[];
    const allPrimitive = arr.every(
      (it) => it === null || it === undefined || typeof it !== 'object',
    );

    return (
      <FieldRow label={label} depth={depth}>
        {allPrimitive ? (
          <ArrayPrimitivesField
            items={arr as Primitive[]}
            readOnly={readOnly}
            onChange={(next) => onUpdate(path, next)}
          />
        ) : (
          // Complex array: show YAML snippet, read-only
          <textarea
            value={yaml.dump(value, { indent: 2 }).trim()}
            readOnly
            rows={Math.min(arr.length * 3 + 1, 8)}
            className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg font-mono bg-slate-50 resize-y"
          />
        )}
      </FieldRow>
    );
  }

  // ── Boolean ───────────────────────────────────────────────────────────────
  if (t === 'boolean') {
    const bval = value as boolean;
    return (
      <FieldRow label={label} depth={depth}>
        <div className="flex items-center gap-3">
          <Toggle value={bval} readOnly={readOnly} onChange={(v) => onUpdate(path, v)} />
          <span className={`text-sm font-medium ${bval ? 'text-sky-600' : 'text-slate-400'}`}>
            {String(bval)}
          </span>
        </div>
      </FieldRow>
    );
  }

  // ── Number ────────────────────────────────────────────────────────────────
  if (t === 'number') {
    return (
      <FieldRow label={label} depth={depth}>
        <NumberField
          value={value as number}
          readOnly={readOnly}
          onChange={(v) => onUpdate(path, v)}
        />
      </FieldRow>
    );
  }

  // ── Null ──────────────────────────────────────────────────────────────────
  if (t === 'null') {
    return (
      <FieldRow label={label} depth={depth}>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded text-xs font-mono italic">
            null
          </span>
          {!readOnly && (
            <button
              type="button"
              onClick={() => onUpdate(path, '')}
              className="text-xs text-sky-600 hover:underline"
            >
              Set value
            </button>
          )}
        </div>
      </FieldRow>
    );
  }

  // ── String (default) ──────────────────────────────────────────────────────
  return (
    <FieldRow label={label} depth={depth}>
      <StringField
        value={String(value ?? '')}
        readOnly={readOnly}
        onChange={(v) => onUpdate(path, v)}
      />
    </FieldRow>
  );
}

// ── FieldRow: label + control on same line ────────────────────────────────────

function FieldRow({
  label,
  depth,
  children,
}: {
  label: string;
  depth: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-3 py-1.5 min-h-[36px]"
      style={{ paddingLeft: `${depth * 16}px` }}
    >
      <span
        className="text-sm font-mono text-slate-500 flex-shrink-0 truncate"
        style={{ minWidth: '120px', maxWidth: '200px' }}
        title={label}
      >
        {label}:
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ValuesUIEditor({ yamlStr, onChange, readOnly }: Props) {
  const [parsed, setParsed] = useState<Record<string, unknown>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const lastEmittedRef = useRef<string>('');

  // Re-parse whenever yamlStr changes FROM OUTSIDE (not from our own onChange)
  useEffect(() => {
    if (yamlStr === lastEmittedRef.current) return;
    if (!yamlStr.trim()) {
      setParsed({});
      setParseError(null);
      return;
    }
    try {
      const result = yaml.load(yamlStr);
      if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
        setParsed(result as Record<string, unknown>);
        setParseError(null);
      } else {
        setParseError('Root must be a YAML mapping object. Switch to the Code tab to fix.');
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'YAML parse error');
    }
  }, [yamlStr]);

  const handleUpdate = useCallback(
    (path: (string | number)[], newValue: unknown) => {
      setParsed((prev) => {
        const next: Record<string, unknown> = JSON.parse(JSON.stringify(prev));

        // Walk the path to the parent and set the value
        let cur: unknown = next;
        for (let i = 0; i < path.length - 1; i++) {
          cur = (cur as Record<string | number, unknown>)[path[i]];
        }
        (cur as Record<string | number, unknown>)[path[path.length - 1]] = newValue;

        try {
          const dumped = dumpYaml(next);
          lastEmittedRef.current = dumped;
          onChange(dumped);
        } catch {
          // ignore serialization errors
        }
        return next;
      });
    },
    [onChange],
  );

  // ── Error state ────────────────────────────────────────────────────────────
  if (parseError) {
    return (
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Cannot render UI editor</p>
          <p className="text-xs text-amber-700 mt-0.5 font-mono">{parseError}</p>
        </div>
      </div>
    );
  }

  const keys = Object.keys(parsed);

  if (keys.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-400 text-sm border border-slate-200 rounded-xl">
        No values to display. Switch to the Code tab to add content.
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white divide-y divide-slate-100">
      {keys.map((k) => (
        <div key={k} className="px-4">
          <RenderNode
            path={[k]}
            label={k}
            value={parsed[k]}
            depth={0}
            readOnly={readOnly}
            onUpdate={handleUpdate}
          />
        </div>
      ))}
    </div>
  );
}
