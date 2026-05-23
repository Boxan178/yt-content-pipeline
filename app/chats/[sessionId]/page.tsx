'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Msg {
  type?: string;
  role?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
  timestamp?: string;
  [k: string]: unknown;
}

function extractText(m: Msg): string {
  const c = m.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((b: any) => (b?.type === 'text' ? b.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function detectRole(m: Msg): 'user' | 'assistant' | 'system' | 'other' {
  const r = m.message?.role ?? m.role ?? m.type;
  if (r === 'user') return 'user';
  if (r === 'assistant') return 'assistant';
  if (r === 'system') return 'system';
  return 'other';
}

export default function ChatDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId;
  const [data, setData] = useState<{ messages: Msg[]; project: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await fetch(`/api/chats/${sessionId}`, { cache: 'no-store' });
      const json = await r.json();
      if (json.ok) setData({ messages: json.messages, project: json.project });
      else setError(json.error || 'unknown');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <main className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-accent" />
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/chats" className="text-sm text-muted hover:text-white">← Chats</Link>
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error || 'Sesión no encontrada'}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-6">
      <header className="mb-4 border-b border-border pb-3">
        <Link href="/chats" className="text-xs text-muted hover:text-white">← Chats</Link>
        <h1 className="mt-1 text-xl font-bold text-white">Sesión {sessionId}</h1>
        <p className="text-xs text-muted">
          {data.messages.length} mensajes · proyecto: <span className="font-mono">{data.project}</span>
        </p>
      </header>

      <div className="space-y-3">
        {data.messages.map((m, idx) => {
          const role = detectRole(m);
          const text = extractText(m);
          if (!text && role === 'other') return null;
          return (
            <div key={idx} className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl border px-3 py-2 text-sm ${
                  role === 'user'
                    ? 'rounded-br-md border-zinc-700/60 bg-zinc-800/80 text-zinc-100'
                    : role === 'assistant'
                    ? 'rounded-bl-md border-accent/20 bg-accent/5 text-zinc-100'
                    : 'border-border bg-bg/40 text-muted'
                }`}
              >
                {role === 'assistant' && text ? (
                  <div className="prose-tg max-w-none text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                  </div>
                ) : text ? (
                  <p className="whitespace-pre-wrap break-words">{text}</p>
                ) : (
                  <p className="text-[10px] italic text-muted">({role} sin texto plano — bloque de tool)</p>
                )}
                {m.timestamp && (
                  <p className="mt-1 text-[9px] text-zinc-500">
                    {new Date(m.timestamp).toLocaleString('es-ES')}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
