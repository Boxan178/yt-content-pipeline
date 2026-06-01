"use client";

// Modal/dropdown que muestra los 4 formatos de guión que el parser entiende.
// Replica el enlace "Ver formatos esperados" de TubeNext.

interface Props {
  open: boolean;
  onClose: () => void;
}

const SAMPLES: Array<{ title: string; body: string }> = [
  {
    title: "1. Escenas con etiquetas explícitas (recomendado)",
    body: `ESCENA 1: Apertura
Prompt: Primer frame de la escena.
Animación: Movimiento o acción de video.

ESCENA 2: Cierre
Prompt: Segundo frame.
Animación: Zoom out y salida.`,
  },
  {
    title: "2. Variantes de cabecera",
    body: `SECUENCIA 1
Prompt: Texto de imagen.
Animacion: Texto de movimiento.

Scene 2
Image prompt: ...
Animation: ...

SHOT 3
Visual Cue: ...
Motion Cue: ...`,
  },
  {
    title: "3. Formato libre por escena",
    body: `▶ ESCENA 8 — El Fantasma
Descripcion larga sin etiqueta Prompt.
Mas detalle visual del frame.

▶ ESCENA 9 — Continuación
Otra descripcion libre del frame.`,
  },
  {
    title: "4. JSON / objetos estructurados",
    body: `[
  {
    "sceneNumber": "1",
    "sceneName": "Apertura",
    "prompt": "Plano inicial del personaje frente a la puerta.",
    "animation_prompt": "Camara avanza lentamente."
  },
  {
    "sceneNumber": "2",
    "image_prompt": "Interior del cafe con luz ambar.",
    "video_prompt": "Paneo lateral con humo en el fondo."
  }
]`,
  },
];

export function FormatsHelper({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 sticky top-0 z-10 bg-zinc-900">
          <h2 className="text-lg font-semibold">Formatos esperados</h2>
          <button
            className="text-zinc-400 hover:text-zinc-100 transition-colors text-sm"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
        <div className="px-6 py-4 space-y-5">
          <p className="text-sm text-zinc-400">
            El parser entiende los 4 formatos siguientes. Si el guión empieza
            por <code className="text-zinc-200">[</code> o{" "}
            <code className="text-zinc-200">&#123;</code> intenta JSON primero;
            si no, busca cabeceras de escena.
          </p>
          {SAMPLES.map((s) => (
            <div key={s.title}>
              <h3 className="text-sm font-semibold text-zinc-200 mb-2">
                {s.title}
              </h3>
              <pre className="bg-zinc-950 border border-zinc-800 rounded-md p-3 text-xs text-zinc-300 overflow-x-auto whitespace-pre">{s.body}</pre>
            </div>
          ))}
          <p className="text-xs text-zinc-500">
            Claves JSON aceptadas: <code>sceneNumber</code> /{" "}
            <code>scene_number</code> / <code>num</code>;{" "}
            <code>sceneName</code> / <code>name</code> / <code>title</code>;{" "}
            <code>prompt</code> / <code>image_prompt</code> /{" "}
            <code>visual cue</code>; <code>animation_prompt</code> /{" "}
            <code>video_prompt</code> / <code>motion</code>;{" "}
            <code>negative_prompt</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
