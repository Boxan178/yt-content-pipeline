-- Aplicada vía MCP el 2026-05-21 al proyecto trnlcfkomjljypzpxejt (youtube-dashboard).
-- Copia local versionable para referencia y reaplicación manual si hace falta.

-- Tabla principal de jobs de miniatura
CREATE TABLE IF NOT EXISTS public.thumbnail_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_title text NOT NULL,
  channel text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','generating','ready','approved','rejected','discarded')),
  prompt text,
  image_url text,
  thumbnail_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS thumbnail_jobs_set_updated_at ON public.thumbnail_jobs;
CREATE TRIGGER thumbnail_jobs_set_updated_at
  BEFORE UPDATE ON public.thumbnail_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS thumbnail_jobs_status_idx ON public.thumbnail_jobs (status);
CREATE INDEX IF NOT EXISTS thumbnail_jobs_created_at_idx ON public.thumbnail_jobs (created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.thumbnail_jobs;

ALTER TABLE public.thumbnail_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "thumbnail_jobs_anon_all" ON public.thumbnail_jobs;
CREATE POLICY "thumbnail_jobs_anon_all"
  ON public.thumbnail_jobs FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "thumbnails_anon_read" ON storage.objects;
CREATE POLICY "thumbnails_anon_read"
  ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'thumbnails');

DROP POLICY IF EXISTS "thumbnails_anon_write" ON storage.objects;
CREATE POLICY "thumbnails_anon_write"
  ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'thumbnails');

DROP POLICY IF EXISTS "thumbnails_anon_update" ON storage.objects;
CREATE POLICY "thumbnails_anon_update"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'thumbnails') WITH CHECK (bucket_id = 'thumbnails');

DROP POLICY IF EXISTS "thumbnails_anon_delete" ON storage.objects;
CREATE POLICY "thumbnails_anon_delete"
  ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'thumbnails');
