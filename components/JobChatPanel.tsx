'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  type StreamEvent,
  type AssistantEvent,
  type UserEvent,
  type SystemEvent,
  type ResultEvent,
  assistantText,
  assistantToolUses,
  userToolResults,
  summarizeToolInput,
  summarizeToolResult,
} from '@/lib/stream-events';

interface Props {
  events: StreamEvent[];
  /** Si el job sigue running, muestra un spinner al final. */
  running?: boolean;
  /** Texto raw del log, por si Pablo quiere ver el log crudo (toggle). */
  rawLog?: string;
  /** Cuando se monta a pantalla completa quiere ocupar todo el alto. */
  fullHeight?: boolean;
  /** Default max-h del scroll. Ignorado si fullHeight. */
  maxHeightClass?: string;
}

const TOOL_ICONS: Record<string, string> = {
  Read: '📄',
  Write: '✏️',
  Edit: '✏️',
  Glob: '🔎',
  Grep: '🔎',
  Bash: '⚡',
  TodoWrite: '✅',
  Task: '🤖',
  WebFetch: '🌐',
  WebSearch: '🌐',
  NotebookEdit: '📓',
};

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '🔧';
}

/**
 * Empareja tool_use (assistant) con su tool_result (user) por tool_use_id.
 * Devuelve un Map para lookup O(1) en el render.
 */
function indexToolResults(events: StreamEvent[]): Map<string, { content: unknown; is_error?: boolean }> {
  const m = new Map<string, { content: unknown; is_error?: boolean }>();
  for (const ev of events) {
    if (ev.type !== 'user') continue;
    for (const r of userToolResults(ev as UserEvent)) {
      m.set(r.tool_use_id, { content: r.content, is_error: r.is_error });
    }
  }
  return m;
}

function ToolBlock({
  name,
  input,
  result,
}: {
  name: string;
  input: unknown;
  result?: { content: unknown; is_error?: boolean };
}) {
  const [expanded, setExpanded] = useState(false);
  const summary = summarizeToolInput(name, input);
  const isError = !!result?.is_error;
  return (
    <div
      className={`rounded-md border bg-bg/40 px-2.5 py-1.5 text-xs ${
        isError ? 'border-red-500/40' : 'border-border'
      }`}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-zinc-300 hover:text-white"
      >
        <span className="shrink-0">{toolIcon(name)}</span>
        <span className={`font-mono text-[11px] ${isError ? 'text-red-300' : 'text-accent/90'}`}>
          {name}
        </span>
        {summary && (
          <span className="truncate font-mono text-[10px] text-muted">{summary}</span>
        )}
        <span className="ml-auto shrink-0 text-[10px] text-muted">
          {result ? (expanded ? '▾' : '▸') : '⋯'}
        </span>
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1.5 border-t border-border/50 pt-1.5">
          {!!input && typeof input === 'object' && Object.keys(input as object).length > 0 && (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-bg/60 p-1.5 font-mono text-[10px] text-zinc-400">
              {JSON.stringify(input, null, 2)}
            </pre>
          )}
          {result && (
            <pre
              className={`max-h-48 overflow-auto whitespace-pre-wrap break-words rounded p-1.5 font-mono text-[10px] ${
                isError ? 'bg-red-500/10 text-red-200' : 'bg-bg/60 text-zinc-400'
              }`}
            >
              {summarizeToolResult(result.content, 4000)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function AssistantBubble({ ev, results }: { ev: AssistantEvent; results: Map<string, { content: unknown; is_error?: boolean }> }) {
  const text = assistantText(ev);
  const tools = assistantToolUses(ev);
  if (!text && tools.length === 0) return null;
  return (
    <div className="space-y-2">
      {text && (
        <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2">
          <div className="prose-tg max-w-none text-sm leading-relaxed text-zinc-100">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        </div>
      )}
      {tools.length > 0 && (
        <div className="space-y-1.5 pl-3">
          {tools.map((t) => (
            <ToolBlock key={t.id} name={t.name} input={t.input} result={results.get(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SystemLine({ ev }: { ev: SystemEvent }) {
  if (ev.subtype === 'init') {
    const tools = Array.isArray(ev.tools) ? ev.tools.length : 0;
    return (
      <div className="text-center text-[10px] text-muted">
        Sesión iniciada · model: {ev.model ?? '?'} · {tools} tools disponibles
      </div>
    );
  }
  return (
    <div className="text-center text-[10px] text-muted">
      system · {ev.subtype ?? '?'}
    </div>
  );
}

function ResultLine({ ev }: { ev: ResultEvent }) {
  const ok = !ev.is_error && (ev.subtype === 'success' || !ev.subtype);
  const cost = typeof ev.total_cost_usd === 'number' ? `$${ev.total_cost_usd.toFixed(4)}` : '';
  const dur = typeof ev.duration_ms === 'number' ? `${(ev.duration_ms / 1000).toFixed(1)}s` : '';
  const turns = typeof ev.num_turns === 'number' ? `${ev.num_turns} turnos` : '';
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs ${
        ok ? 'border-green-500/40 bg-green-500/5 text-green-300' : 'border-red-500/40 bg-red-500/5 text-red-300'
      }`}
    >
      <div className="font-semibold">
        {ok ? '✓ Job completado' : `✗ ${ev.subtype ?? 'error'}`}
      </div>
      <div className="mt-0.5 text-[10px] text-muted">
        {[cost, dur, turns].filter(Boolean).join(' · ')}
      </div>
    </div>
  );
}

export function JobChatPanel({
  events,
  running = false,
  rawLog,
  fullHeight = false,
  maxHeightClass = 'max-h-[420px]',
}: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const resultsIdx = useMemo(() => indexToolResults(events), [events]);

  // Auto-scroll al fondo cuando llegan nuevos eventos
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    // Solo auto-scroll si el usuario está ya cerca del fondo (deja leer arriba sin saltos).
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom || running) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events.length, running]);

  const scrollClass = fullHeight ? 'flex-1 overflow-y-auto' : `overflow-y-auto ${maxHeightClass}`;

  if (showRaw) {
    return (
      <div className={fullHeight ? 'flex h-full flex-col' : ''}>
        <div className="mb-2 flex items-center justify-end">
          <button
            onClick={() => setShowRaw(false)}
            className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:text-white"
          >
            ← chat
          </button>
        </div>
        <pre
          className={`whitespace-pre-wrap break-words rounded-lg border border-border bg-bg/60 p-3 font-mono text-[10px] leading-relaxed text-zinc-300 ${scrollClass}`}
        >
          {rawLog || '(log vacío)'}
        </pre>
      </div>
    );
  }

  if (events.length === 0 && !running) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
        Sin eventos. {rawLog ? 'El log existe pero no se pudo parsear como stream-json.' : 'Job aún sin output.'}
        {rawLog && (
          <button
            onClick={() => setShowRaw(true)}
            className="ml-2 rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:text-white"
          >
            ver raw
          </button>
        )}
      </div>
    );
  }

  // Última métrica result para el footer
  const lastResult = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'result') return events[i] as ResultEvent;
    }
    return null;
  })();

  return (
    <div className={fullHeight ? 'flex h-full flex-col' : ''}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] text-muted">
          {lastResult && (
            <>
              {typeof lastResult.total_cost_usd === 'number' && (
                <span className="mr-2">💰 ${lastResult.total_cost_usd.toFixed(4)}</span>
              )}
              {typeof lastResult.duration_ms === 'number' && (
                <span className="mr-2">⏱️ {(lastResult.duration_ms / 1000).toFixed(1)}s</span>
              )}
              {typeof lastResult.num_turns === 'number' && (
                <span>🔄 {lastResult.num_turns} turnos</span>
              )}
            </>
          )}
        </div>
        <button
          onClick={() => setShowRaw(true)}
          className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:text-white"
          title="Ver log NDJSON crudo"
        >
          raw
        </button>
      </div>
      <div
        ref={scrollRef}
        className={`space-y-2.5 rounded-lg border border-border bg-bg/40 p-3 ${scrollClass}`}
      >
        {events.map((ev, idx) => {
          if (ev.type === 'system') return <SystemLine key={idx} ev={ev as SystemEvent} />;
          if (ev.type === 'assistant') return <AssistantBubble key={idx} ev={ev as AssistantEvent} results={resultsIdx} />;
          if (ev.type === 'result') return <ResultLine key={idx} ev={ev as ResultEvent} />;
          // user events: ya consumidos por AssistantBubble como tool_results
          return null;
        })}
        {running && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Claude trabajando…
          </div>
        )}
      </div>
    </div>
  );
}
