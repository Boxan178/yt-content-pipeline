'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { StreamEvent, AssistantEvent, UserEvent } from '@/lib/stream-events';
import {
  assistantText,
  assistantToolUses,
  userToolResults,
  summarizeToolInput,
  summarizeToolResult,
} from '@/lib/stream-events';

type Role = 'user' | 'assistant';

interface ChatTurn {
  id: string;
  role: Role;
  /** Texto del usuario, vacío en assistant (los assistants vienen como events). */
  text: string;
  /** Eventos stream-json del turno assistant. */
  events?: StreamEvent[];
  /** Si el assistant emitió result, su payload (para coste/duración). */
  result?: {
    cost?: number;
    durationMs?: number;
    turns?: number;
    isError?: boolean;
  };
  at: number;
}

type Model = 'sonnet' | 'opus';
type Effort = 'low' | 'medium' | 'high' | 'max';

const STORAGE_KEY_WIDTH = 'ytcp:chat:width';
const STORAGE_KEY_MODEL = 'ytcp:chat:model';
const STORAGE_KEY_EFFORT = 'ytcp:chat:effort';
const STORAGE_KEY_OPEN = 'ytcp:chat:open';

const MIN_W = 360;
const MAX_W = 720;
const DEFAULT_W = 520;

const TOOL_ICONS: Record<string, string> = {
  Read: '📄', Write: '✏️', Edit: '✏️', Glob: '🔎', Grep: '🔎',
  Bash: '⚡', TodoWrite: '✅', Task: '🤖', WebFetch: '🌐', WebSearch: '🌐',
};

function toolIcon(name: string) {
  return TOOL_ICONS[name] ?? '🔧';
}

export function ChatDock() {
  // `hydrated` evita el flash SSR→cliente: el HTML del server pinta un placeholder
  // de ancho fijo neutro; sólo tras montar (y leer localStorage) decidimos si el
  // dock va abierto o colapsado. Antes el server pintaba el dock ancho y se
  // colapsaba en cada carga para quien lo tiene cerrado (tirón visible).
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState<boolean>(true);
  const [width, setWidth] = useState<number>(DEFAULT_W);
  const [model, setModel] = useState<Model>('sonnet');
  const [effort, setEffort] = useState<Effort>('medium');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  // Carga inicial desde localStorage
  useEffect(() => {
    try {
      const w = Number(localStorage.getItem(STORAGE_KEY_WIDTH));
      if (w >= MIN_W && w <= MAX_W) setWidth(w);
      const m = localStorage.getItem(STORAGE_KEY_MODEL);
      if (m === 'sonnet' || m === 'opus') setModel(m);
      const e = localStorage.getItem(STORAGE_KEY_EFFORT);
      if (e === 'low' || e === 'medium' || e === 'high' || e === 'max') setEffort(e);
      const o = localStorage.getItem(STORAGE_KEY_OPEN);
      if (o === '0') setOpen(false);
    } catch {}
    setHydrated(true);
  }, []);

  // Persistir width/model/effort
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY_WIDTH, String(width)); } catch {} }, [width]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY_MODEL, model); } catch {} }, [model]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY_EFFORT, effort); } catch {} }, [effort]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY_OPEN, open ? '1' : '0'); } catch {} }, [open]);

  // Auto-scroll al fondo cuando se añade turno o cambia busy
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [turns.length, busy]);

  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startW: width };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = dragRef.current.startX - ev.clientX;
      const next = Math.max(MIN_W, Math.min(MAX_W, dragRef.current.startW + dx));
      setWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const send = async () => {
    const message = input.trim();
    if (!message || busy) return;
    setError(null);
    setInput('');
    const userTurn: ChatTurn = {
      id: crypto.randomUUID(),
      role: 'user',
      text: message,
      at: Date.now(),
    };
    const assistantId = crypto.randomUUID();
    setTurns((prev) => [
      ...prev,
      userTurn,
      // Burbuja vacía del asistente que iremos rellenando con eventos SSE
      { id: assistantId, role: 'assistant', text: '', events: [], at: Date.now() },
    ]);
    setBusy(true);
    try {
      const r = await fetch('/api/claude/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId, model, effort }),
      });
      if (!r.ok || !r.body) {
        setError(`HTTP ${r.status}`);
        return;
      }
      // Parser SSE manual sobre la respuesta streaming
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\n\n/);
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          // Cada bloque tiene 0..N líneas "event: X" y "data: Y"
          const lines = block.split(/\r?\n/);
          let evName = 'message';
          let data = '';
          for (const ln of lines) {
            if (ln.startsWith(':')) continue; // comentario / heartbeat
            if (ln.startsWith('event:')) evName = ln.slice(6).trim();
            else if (ln.startsWith('data:')) data += ln.slice(5).trim();
          }
          if (!data) continue;
          if (evName === 'event') {
            try {
              const ev = JSON.parse(data) as StreamEvent;
              setTurns((prev) => {
                const next = [...prev];
                const idx = next.findIndex((t) => t.id === assistantId);
                if (idx < 0) return prev;
                next[idx] = {
                  ...next[idx],
                  events: [...(next[idx].events ?? []), ev],
                };
                return next;
              });
            } catch {}
          } else if (evName === 'done') {
            try {
              const payload = JSON.parse(data) as { sessionId?: string };
              if (payload.sessionId) setSessionId(payload.sessionId);
            } catch {}
            // Extraer result del último evento del turno
            setTurns((prev) => {
              const next = [...prev];
              const idx = next.findIndex((t) => t.id === assistantId);
              if (idx < 0) return prev;
              const evs = next[idx].events ?? [];
              const resultEv = evs.find((e) => e.type === 'result') as any | undefined;
              if (resultEv) {
                next[idx] = {
                  ...next[idx],
                  result: {
                    cost: resultEv.total_cost_usd,
                    durationMs: resultEv.duration_ms,
                    turns: resultEv.num_turns,
                    isError: !!resultEv.is_error,
                  },
                };
              }
              return next;
            });
          } else if (evName === 'error') {
            try {
              const payload = JSON.parse(data) as { message?: string };
              setError(payload.message || 'error desconocido');
            } catch {
              setError('error desconocido');
            }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const newConversation = () => {
    if (busy) return;
    setTurns([]);
    setSessionId(null);
    setError(null);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envía; Shift+Enter salta línea
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Pre-hidratación: placeholder neutro de ancho fijo. Coincide con el render del
  // server (no sabemos aún si está abierto/cerrado), así que reservamos el ancho
  // por defecto sin pintar contenido. Evita el tirón al colapsar tras leer LS.
  if (!hydrated) {
    return <aside aria-hidden className="chat-sliver shrink-0" style={{ width: DEFAULT_W }} />;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="chat-sliver fixed right-2 top-1/2 z-20 -translate-y-1/2 rounded-l-md border-r-0 px-1.5 py-3 text-[10px] text-zinc-400 hover:text-white"
        title="Abrir chat"
      >
        ←<br />C<br />h<br />a<br />t
      </button>
    );
  }

  return (
    <aside
      className="chat-sliver relative flex shrink-0 flex-col"
      style={{ width }}
    >
      {/* Resizer */}
      <div
        onMouseDown={onDragStart}
        className="absolute -left-1 top-0 z-10 h-full w-1.5 cursor-ew-resize bg-transparent hover:bg-accent/30"
        title="Arrastrar para cambiar el ancho"
      />

      {/* Header */}
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="text-sm font-semibold text-white">Chat</span>
        <button
          onClick={() => setModel((m) => (m === 'sonnet' ? 'opus' : 'sonnet'))}
          className={`rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase transition ${
            model === 'opus'
              ? 'border-purple-500/40 bg-purple-500/10 text-purple-300'
              : 'border-blue-500/40 bg-blue-500/10 text-blue-300'
          }`}
          title="Cambiar modelo"
        >
          {model}
        </button>
        <button
          onClick={() => {
            const list: Effort[] = ['low', 'medium', 'high', 'max'];
            const i = list.indexOf(effort);
            setEffort(list[(i + 1) % list.length]);
          }}
          className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono uppercase text-zinc-300 hover:bg-white/10"
          title="Cambiar effort"
        >
          {effort}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={newConversation}
            disabled={busy}
            className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
            title="Nueva conversación"
          >
            + nueva
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-white/10 hover:text-white"
            title="Cerrar"
          >
            →
          </button>
        </div>
      </header>

      {/* Mensajes */}
      <div ref={scrollerRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {turns.length === 0 && !busy && (
          <div className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-xs text-zinc-400">
            Habla con claude. Tiene acceso a todas tus skills (SARA, ELENA, MARCO AURELIO, IRIS, etc.) y al filesystem.
          </div>
        )}
        {turns.map((t) =>
          t.role === 'user' ? <UserBubble key={t.id} turn={t} /> : <AssistantTurn key={t.id} turn={t} />,
        )}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            claude está pensando…
          </div>
        )}
        {error && (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-2">
        <div className="flex items-end gap-2 rounded-lg border border-white/10 bg-white/5 p-2 focus-within:border-accent/60">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Escribe un mensaje…  (Enter envía · Shift+Enter salta línea)"
            rows={1}
            className="max-h-40 flex-1 resize-none bg-transparent text-sm leading-relaxed text-zinc-100 placeholder-zinc-600 focus:outline-none"
            disabled={busy}
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </div>
    </aside>
  );
}

function UserBubble({ turn }: { turn: ChatTurn }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md border border-zinc-700/60 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100">
        <div className="whitespace-pre-wrap break-words">{turn.text}</div>
      </div>
    </div>
  );
}

function AssistantTurn({ turn }: { turn: ChatTurn }) {
  const events = turn.events ?? [];
  const results = indexToolResults(events);
  const ok = !turn.result?.isError;
  return (
    <div className="space-y-2">
      {events.map((ev, idx) => {
        if (ev.type === 'assistant') {
          return <AssistantEventBubble key={idx} ev={ev as AssistantEvent} results={results} />;
        }
        return null;
      })}
      {turn.result && (
        <div className={`flex items-center gap-2 px-1 text-[10px] ${ok ? 'text-zinc-500' : 'text-red-300'}`}>
          {ok ? '✓' : '✗'}
          {typeof turn.result.cost === 'number' && <span>${turn.result.cost.toFixed(4)}</span>}
          {typeof turn.result.durationMs === 'number' && (
            <span>{(turn.result.durationMs / 1000).toFixed(1)}s</span>
          )}
          {typeof turn.result.turns === 'number' && <span>{turn.result.turns} turnos</span>}
        </div>
      )}
    </div>
  );
}

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

function AssistantEventBubble({
  ev,
  results,
}: {
  ev: AssistantEvent;
  results: Map<string, { content: unknown; is_error?: boolean }>;
}) {
  const text = assistantText(ev);
  const tools = assistantToolUses(ev);
  if (!text && tools.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {text && (
        <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-accent/20 bg-accent/5 px-3 py-2">
          <div className="prose-tg max-w-none text-sm leading-relaxed text-zinc-100">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        </div>
      )}
      {tools.length > 0 && (
        <div className="space-y-1 pl-3">
          {tools.map((t) => (
            <ToolBlock key={t.id} name={t.name} input={t.input} result={results.get(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
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
    <div className={`rounded-md border bg-bg/40 px-2 py-1 text-xs ${isError ? 'border-red-500/40' : 'border-border'}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-zinc-300 hover:text-white"
      >
        <span className="shrink-0">{toolIcon(name)}</span>
        <span className={`font-mono text-[10px] ${isError ? 'text-red-300' : 'text-accent/90'}`}>{name}</span>
        {summary && <span className="truncate font-mono text-[10px] text-muted">{summary}</span>}
        <span className="ml-auto shrink-0 text-[10px] text-muted">
          {result ? (expanded ? '▾' : '▸') : '⋯'}
        </span>
      </button>
      {expanded && result && (
        <pre
          className={`mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded p-1.5 font-mono text-[10px] ${
            isError ? 'bg-red-500/10 text-red-200' : 'bg-bg/60 text-zinc-400'
          }`}
        >
          {summarizeToolResult(result.content, 4000)}
        </pre>
      )}
    </div>
  );
}
