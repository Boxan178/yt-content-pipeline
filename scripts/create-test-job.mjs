// Script de prueba: inserta un job de miniatura para verificar el flujo.
// Uso:
//   node scripts/create-test-job.mjs "Título del vídeo" "moderni-stoici" "Tu prompt aquí"

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const [title, channel, ...promptParts] = process.argv.slice(2);
const prompt = promptParts.join(' ');

if (!title || !prompt) {
  console.error('Uso: node scripts/create-test-job.mjs "<título>" "<canal>" "<prompt>"');
  process.exit(1);
}

const { data, error } = await sb
  .from('thumbnail_jobs')
  .insert({
    video_title: title,
    channel: channel || null,
    prompt,
    thumbnail_meta: { aspect_ratio: '16:9', resolution: '2K', output_format: 'jpg' },
  })
  .select()
  .single();

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('✓ Job creado:', data.id);
console.log('  Estado inicial:', data.status);
console.log('  Espera unos segundos a que el worker lo coja...');
