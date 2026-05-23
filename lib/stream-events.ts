// Parser de los eventos NDJSON que emite `claude -p --output-format stream-json --verbose`.
// Browser-safe (no toca node:fs). Se usa desde el endpoint API (para devolverlos
// ya parseados) y desde JobChatPanel (para renderizarlos).

export type StreamContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }
  | { type: 'thinking'; thinking: string }
  | { type: string; [k: string]: unknown };

export interface AssistantEvent {
  type: 'assistant';
  message: {
    id?: string;
    role: 'assistant';
    content: StreamContentBlock[];
    model?: string;
    stop_reason?: string | null;
    usage?: Record<string, unknown>;
  };
  parent_tool_use_id?: string | null;
  session_id?: string;
}

export interface UserEvent {
  type: 'user';
  message: {
    role: 'user';
    content: StreamContentBlock[];
  };
  parent_tool_use_id?: string | null;
  session_id?: string;
}

export interface SystemEvent {
  type: 'system';
  subtype?: string;
  session_id?: string;
  model?: string;
  tools?: string[];
  cwd?: string;
  [k: string]: unknown;
}

export interface ResultEvent {
  type: 'result';
  subtype?: 'success' | 'error_max_turns' | 'error_during_execution' | string;
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  usage?: Record<string, unknown>;
  [k: string]: unknown;
}

export type StreamEvent = AssistantEvent | UserEvent | SystemEvent | ResultEvent | { type: string; [k: string]: unknown };

/**
 * Parsea el contenido completo del log de un job. Tolera:
 *  - Cabecera ytcp (líneas que empiezan por `[ytcp ` o el separador `--- claude output ---`).
 *  - Líneas vacías.
 *  - Líneas no-JSON (las descarta).
 *
 * Si una línea NDJSON está truncada (el log se leyó a mitad de escritura),
 * se descarta sin romper el resto.
 */
export function parseStreamLog(raw: string): StreamEvent[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const events: StreamEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('[ytcp')) continue;
    if (trimmed.startsWith('---')) continue;
    if (!trimmed.startsWith('{')) continue;
    try {
      const ev = JSON.parse(trimmed) as StreamEvent;
      if (ev && typeof ev === 'object' && typeof (ev as any).type === 'string') {
        events.push(ev);
      }
    } catch {
      // línea truncada o malformada — la saltamos
    }
  }
  return events;
}

/**
 * Extrae el texto puro de un AssistantEvent (concatena bloques `text`).
 */
export function assistantText(ev: AssistantEvent): string {
  return ev.message.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * Devuelve los bloques tool_use de un assistant event.
 */
export function assistantToolUses(
  ev: AssistantEvent,
): Array<{ id: string; name: string; input: unknown }> {
  return ev.message.content
    .filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));
}

/**
 * Devuelve los bloques tool_result de un user event (responses a tool calls).
 */
export function userToolResults(
  ev: UserEvent,
): Array<{ tool_use_id: string; content: unknown; is_error?: boolean }> {
  return ev.message.content
    .filter(
      (b): b is { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean } =>
        b.type === 'tool_result',
    )
    .map((b) => ({ tool_use_id: b.tool_use_id, content: b.content, is_error: b.is_error }));
}

/**
 * Pretty-print del input de un tool_use para mostrar en burbuja compacta.
 */
export function summarizeToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;
  // Heurística por tool conocido
  if (name === 'Read' && typeof obj.file_path === 'string') return obj.file_path;
  if (name === 'Write' && typeof obj.file_path === 'string') return obj.file_path;
  if (name === 'Edit' && typeof obj.file_path === 'string') return obj.file_path;
  if (name === 'Glob' && typeof obj.pattern === 'string') return obj.pattern;
  if (name === 'Grep' && typeof obj.pattern === 'string') return obj.pattern;
  if (name === 'Bash' && typeof obj.command === 'string') {
    const cmd = obj.command;
    return cmd.length > 80 ? cmd.slice(0, 80) + '…' : cmd;
  }
  if (name === 'TodoWrite') return '(actualiza tareas)';
  if (name === 'Task' && typeof obj.subagent_type === 'string') return `→ ${obj.subagent_type}`;
  // Fallback: primera key con valor string corto
  const firstStr = Object.entries(obj).find(([, v]) => typeof v === 'string' && (v as string).length < 120);
  if (firstStr) return `${firstStr[0]}: ${firstStr[1]}`;
  return JSON.stringify(obj).slice(0, 100);
}

/**
 * Pretty-print del content de un tool_result. Recorta a maxLen chars.
 */
export function summarizeToolResult(content: unknown, maxLen = 200): string {
  if (typeof content === 'string') {
    return content.length > maxLen ? content.slice(0, maxLen) + '…' : content;
  }
  if (Array.isArray(content)) {
    // Array de bloques { type: 'text', text: '...' }
    const text = content
      .map((b) => (b && typeof b === 'object' && 'text' in b ? (b as any).text : ''))
      .filter(Boolean)
      .join('\n');
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  }
  if (content && typeof content === 'object') {
    const j = JSON.stringify(content);
    return j.length > maxLen ? j.slice(0, maxLen) + '…' : j;
  }
  return String(content ?? '');
}
