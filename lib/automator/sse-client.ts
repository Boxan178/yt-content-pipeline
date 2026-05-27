// Cliente SSE para consumir /api/run desde el navegador.
//
// EventSource solo soporta GET sin body — y nosotros mandamos FormData con la
// ref image y el project JSON. Por eso usamos fetch() + getReader() y parseamos
// los eventos manualmente.

export type SseEvent = Record<string, unknown> & { event?: string };

export interface RunSseOptions {
  project: object;
  refFile?: File | null;
  onEvent: (event: SseEvent) => void;
  signal?: AbortSignal;
}

export async function runProjectSse({
  project,
  refFile,
  onEvent,
  signal,
}: RunSseOptions): Promise<void> {
  const form = new FormData();
  form.append("project", JSON.stringify(project));
  if (refFile) form.append("ref_file", refFile);

  const res = await fetch("/api/run", {
    method: "POST",
    body: form,
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Run failed: HTTP ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE boundary: doble newline
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      // Cada bloque puede tener varias líneas; nos quedamos con `data: ...`
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trimStart();
        if (!payload) continue;
        try {
          onEvent(JSON.parse(payload) as SseEvent);
        } catch {
          onEvent({ event: "parse_error", raw: payload });
        }
      }
    }
  }
}
