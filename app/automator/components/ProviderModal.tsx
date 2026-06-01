"use client";

// Modal de configuración de proveedor/modelo. Replica el modal de TubeNext
// (capturas: "Proveedor de imagen" / "Proveedor de video").

import { useEffect } from "react";

interface ModelInfo {
  slug: string;
  label: string;
  description?: string;
  capabilities: string[];
  cost_label: string;
}

interface Provider {
  id: string;
  name: string;
  description: string;
  billing_label: string;
  billing_color: "emerald" | "amber" | "blue" | "zinc";
  enabled: boolean;
  models: ModelInfo[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  kind: "image" | "video";
  providers: Provider[];
  selectedProvider: string;
  selectedModel: string;
  onSelectProvider?: (id: string) => void;
  onSelectModel: (slug: string) => void;
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l8 4v6c0 4.5-3.5 7.5-8 8-4.5-.5-8-3.5-8-8V7l8-4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImageIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <path d="M3 17l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function VideoIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 5h12a2 2 0 012 2v3l4-3v10l-4-3v3a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z" />
    </svg>
  );
}

function ProviderRadioCard({
  provider,
  selected,
  onSelect,
}: {
  provider: Provider;
  selected: boolean;
  onSelect: () => void;
}) {
  const billingColors = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    blue: "text-blue-300",
    zinc: "text-zinc-400",
  };
  return (
    <button
      type="button"
      onClick={provider.enabled ? onSelect : undefined}
      disabled={!provider.enabled}
      className={`text-left p-4 rounded-lg border transition-colors ${
        selected
          ? "bg-red-500/10 border-red-500/50"
          : provider.enabled
            ? "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
            : "bg-zinc-900/30 border-zinc-800 opacity-50 cursor-not-allowed"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ${
            selected ? "border-red-500 bg-red-500/30" : "border-zinc-600"
          }`}
        >
          {selected && (
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 m-auto mt-[3px]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-100">{provider.name}</div>
          <div className="text-xs text-zinc-400 mt-0.5">{provider.description}</div>
          <div className={`text-[11px] mt-1.5 ${billingColors[provider.billing_color]}`}>
            {provider.billing_label}
          </div>
        </div>
      </div>
    </button>
  );
}

function ModelTab({
  model,
  selected,
  onSelect,
}: {
  model: ModelInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${
        selected
          ? "bg-zinc-700 text-zinc-100"
          : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
      }`}
    >
      {model.label}
    </button>
  );
}

export function ProviderModal({
  open,
  onClose,
  kind,
  providers,
  selectedProvider,
  selectedModel,
  onSelectProvider,
  onSelectModel,
}: Props) {
  // Scroll-lock del body + cierre con Escape mientras el modal está abierto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const provider = providers.find((p) => p.id === selectedProvider);
  const model = provider?.models.find((m) => m.slug === selectedModel) ?? provider?.models[0];

  const KindIcon = kind === "image" ? ImageIcon : VideoIcon;
  const title = kind === "image" ? "Proveedor de imagen" : "Proveedor de vídeo";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-md bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
              <KindIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="text-xs text-zinc-500">Elige proveedor y configura credenciales</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-100 transition-colors text-xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Info banner */}
          <div className="flex items-start gap-2.5 p-3 rounded-md bg-blue-500/10 border border-blue-500/30">
            <ShieldIcon className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-200 leading-relaxed">
              Las claves se gestionan en el VPS y nunca se envían al navegador. Solo el
              administrador puede modificarlas.
            </p>
          </div>

          {/* Proveedores */}
          <div>
            <div className="label-uppercase">Seleccionar proveedor</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {providers.map((p) => (
                <ProviderRadioCard
                  key={p.id}
                  provider={p}
                  selected={p.id === selectedProvider}
                  onSelect={() => onSelectProvider?.(p.id)}
                />
              ))}
            </div>
          </div>

          {/* Modelo */}
          {provider && provider.enabled && provider.models.length > 0 && (
            <>
              <div className="border-t border-zinc-800 pt-4">
                <div className="text-sm font-semibold text-zinc-100 mb-3">
                  {provider.name} — Configuración
                </div>
                <div className="label-uppercase">Modelo</div>
                <div className="flex flex-wrap gap-1.5">
                  {provider.models.map((m) => (
                    <ModelTab
                      key={m.slug}
                      model={m}
                      selected={m.slug === selectedModel}
                      onSelect={() => onSelectModel(m.slug)}
                    />
                  ))}
                </div>
                {model?.description && (
                  <p className="text-xs text-zinc-400 mt-2">{model.description}</p>
                )}
              </div>

              {/* Funciones compatibles */}
              {model && model.capabilities.length > 0 && (
                <div>
                  <div className="label-uppercase">Funciones compatibles</div>
                  <div className="flex flex-wrap gap-1.5">
                    {model.capabilities.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px]"
                      >
                        <CheckIcon className="w-2.5 h-2.5" />
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Coste */}
              {model && (
                <div className="border-t border-zinc-800 pt-4">
                  <div className="label-uppercase">
                    {kind === "image" ? "Coste por imagen" : "Coste por vídeo"}
                  </div>
                  <div className="text-sm font-semibold text-zinc-100">{model.cost_label}</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-zinc-800 sticky bottom-0 bg-zinc-900">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={onClose} className="btn-primary">
            <CheckIcon className="w-4 h-4" />
            Guardar configuración
          </button>
        </div>
      </div>
    </div>
  );
}
