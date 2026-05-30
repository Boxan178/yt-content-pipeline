/**
 * Tipos compartidos del módulo Lab (canales-borrador + ideas + research).
 * Browser-safe: sin `server-only`, sin acceso a fs.
 *
 * Persistencia (server-only) en `~/.yt-content-pipeline/lab/`:
 *   - channels.json   (ChannelsState)
 *   - ideas.json      (IdeasState)
 *   - research.json   (ResearchState)
 *
 * Las claves coinciden con la sección 3.2 de `LAB-PLAN-2026-05-25.md`.
 */

// ── ChannelDraft ──────────────────────────────────────────────────────────

export type ChannelDraftStatus =
  | 'draft'
  | 'validated'
  | 'bootstrapped'
  | 'in-production'
  | 'archived';

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export type DraftLanguage = 'en' | 'es' | 'pt' | 'it' | 'fr' | 'other';

export interface ScriptTarget {
  words: number;
  minutes: number;
  wps: number;
}

export interface ImagePrompt {
  beat: string;
  prompt: string;
  cameraAngle: string;
  lighting: string;
  mood: string;
  action: string;
}

export interface ThumbnailConcept {
  visual: string;
  textOverlay: string;
  emotionalTrigger: string;
  prompt: string;
}

export type ValidationVerdict = 'green' | 'yellow' | 'red';

export interface ValidationReport {
  verdict: ValidationVerdict;
  demandScore: number;       // 0-100
  saturationScore: number;   // 0-100
  wedges: string[];
  risks: string[];
  referenceChannelsRecommended: Array<{ name: string; url: string; reason: string }>;
  keywords: Array<{ keyword: string; volume: number; competition: number }>;
  rawReport: string;
  runAt: string;
}

export type BootstrapAssetMethod = 'canva-mcp' | 'nano-banana-manual' | 'both';

export interface BootstrapOutcome {
  chosenName: string;
  chosenHandle: string;
  chosenDescription: string;
  descriptionVersion: 'A' | 'B' | 'C';
  logoPrompt: string;
  bannerPrompt: string;
  assetGenerationMethod: BootstrapAssetMethod;
  diskPath?: string;
  bootstrappedAt?: string;
  skillCreated?: boolean;
  skillPath?: string;
}

export interface ChannelDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ChannelDraftStatus;
  currentStep: WizardStep;

  // PASO 1 — Referencia
  referenceChannelUrl: string;
  referenceChannelName?: string;
  language: DraftLanguage;
  initialTopic: string;
  transcripts: string[];

  // PASO 2 — Análisis style-engine
  channelAnalysis?: string;
  styleDna?: string;
  scriptSample?: string;
  scriptTarget?: ScriptTarget;

  // PASO 3 — Visual
  sampleFrameUrls: string[];
  visualStyleProfile?: string;
  imagePrompts?: ImagePrompt[];
  thumbnailSampleUrls: string[];
  thumbnailStyleProfile?: string;
  thumbnailConcepts?: ThumbnailConcept[];

  // PASO 4 — Validación
  validation?: ValidationReport;

  // PASO 5 — Bootstrap
  bootstrap?: BootstrapOutcome;

  // Histórico de jobs lanzados
  jobIds: string[];
}

export interface ChannelsState {
  version: 1;
  drafts: ChannelDraft[];
}

// ── Idea ──────────────────────────────────────────────────────────────────

export type IdeaStatus = 'raw' | 'developing' | 'in-production' | 'published';

export interface Idea {
  id: string;
  createdAt: string;
  title: string;
  description: string;
  tags: string[];
  /** slug del canal real o del draft (uuid). null = en Banco. */
  channelId: string | null;
  priority: 1 | 2 | 3 | 4 | 5;
  status: IdeaStatus;
  sourceResearchId: string | null;
  replicatedFromIdeaId: string | null;
  /**
   * Campos opcionales usados por la columna "Ideas" del kanban de canal
   * (`/channels/[slug]`). No los toca el módulo `/lab`.
   */
  /** Carpeta de vídeo creada al pulsar "Iniciar pipeline". */
  videoFolder?: string | null;
  /** jobId del SARA lanzado al iniciar pipeline. */
  pipelineJobId?: string | null;
  /** ISO de cuándo se lanzó el pipeline. */
  pipelineStartedAt?: string | null;
  /** URL del vídeo propio que inspiró la idea (replicación). */
  sourceVideoUrl?: string | null;
  /** Título del vídeo propio que inspiró la idea. */
  sourceVideoTitle?: string | null;
}

export interface IdeasState {
  version: 1;
  ideas: Idea[];
}

// ── Research ──────────────────────────────────────────────────────────────

export type ResearchMode = 'quick' | 'deep';

export interface Research {
  id: string;
  createdAt: string;
  mode: ResearchMode;
  niche: string;
  keywords: string[];
  channelDraftId: string | null;
  summary: string;
  outliers: Array<{ title: string; channel: string; views: number; vph: number; url: string }>;
  breakoutChannels: Array<{ name: string; url: string; growthRate: number; reason: string }>;
  keywordResearch: Array<{ keyword: string; volume: number; competition: number; trend: 'up' | 'flat' | 'down' }>;
  verdict: ValidationVerdict;
  rawReport: string;
}

export interface ResearchState {
  version: 1;
  researches: Research[];
}
