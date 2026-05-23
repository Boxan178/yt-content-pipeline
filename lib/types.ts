export type JobStatus =
  | 'pending'
  | 'generating'
  | 'ready'
  | 'approved'
  | 'rejected'
  | 'discarded';

export interface ThumbnailJob {
  id: string;
  video_title: string;
  channel: string | null;
  status: JobStatus;
  prompt: string | null;
  image_url: string | null;
  thumbnail_meta: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  pending: 'Pendiente',
  generating: 'Generando',
  ready: 'Lista para revisar',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  discarded: 'Descartada',
};

export const STATUS_COLOR: Record<JobStatus, string> = {
  pending: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
  generating: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  ready: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  approved: 'bg-green-500/20 text-green-300 border-green-500/40',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/40',
  discarded: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40',
};
