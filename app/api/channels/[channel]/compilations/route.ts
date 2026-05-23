import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getChannel } from '@/lib/channels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CompilationSource {
  folderPath: string;
  title: string;
  slug?: string;
}

interface CompilationMetadata {
  version: 1;
  type: 'compilation';
  title: string;
  level: 1 | 2;
  createdAt: string;
  sources: CompilationSource[];
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * POST /api/channels/[channel]/compilations
 * Body: { title: string, sources: Array<{folderPath, title, slug?}>, level?: 1|2 }
 *
 * Crea la carpeta de la recopilación en _EN PRODUCCIÓN/ con su _PACKAGING/
 * y compilation.json apuntando a los vídeos fuente. NO renderiza nada — el
 * render real lo hace LUIS adaptado para concat (trabajo pendiente en la skill
 * externa).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { channel: string } },
) {
  const channel = getChannel(params.channel);
  if (!channel || !channel.enabled) {
    return NextResponse.json({ ok: false, error: 'Channel not found' }, { status: 404 });
  }
  let body: { title?: string; sources?: CompilationSource[]; level?: 1 | 2 };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const title = (body.title ?? '').trim();
  const sources = Array.isArray(body.sources) ? body.sources : [];
  const level: 1 | 2 = body.level === 2 ? 2 : 1;
  if (!title) return NextResponse.json({ ok: false, error: 'title vacío' }, { status: 400 });
  if (sources.length < 2) {
    return NextResponse.json({ ok: false, error: 'Necesitas al menos 2 vídeos fuente' }, { status: 400 });
  }

  const slug = slugify(title);
  const productionFolder = channel.stateFolders.production;
  if (!productionFolder) {
    return NextResponse.json({ ok: false, error: 'Canal sin carpeta de producción configurada' }, { status: 422 });
  }

  const folderName = `compilation-${slug}`;
  const folderPath = path.join(channel.rootPath, productionFolder, folderName);
  if (existsSync(folderPath)) {
    return NextResponse.json({ ok: false, error: `Ya existe ${folderName}` }, { status: 409 });
  }

  await mkdir(folderPath, { recursive: true });
  await mkdir(path.join(folderPath, '_PACKAGING'), { recursive: true });
  await mkdir(path.join(folderPath, '_PACKAGING', 'MINIATURAS'), { recursive: true });
  await mkdir(path.join(folderPath, '01_BRUTOS'), { recursive: true });
  await mkdir(path.join(folderPath, 'RENDER'), { recursive: true });

  const metadata: CompilationMetadata = {
    version: 1,
    type: 'compilation',
    title,
    level,
    createdAt: new Date().toISOString(),
    sources: sources.map((s) => ({
      folderPath: s.folderPath.replace(/\\/g, '/'),
      title: s.title,
      slug: s.slug,
    })),
  };
  await writeFile(
    path.join(folderPath, '_PACKAGING', 'compilation.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8',
  );

  // Packaging.md mínimo para que el resto del pipeline lo reconozca como vídeo
  const packagingMd = `# ${title}

> **Tipo**: Recopilación nivel ${level} · ${sources.length} historias fuente.

## Historias incluidas

${sources.map((s, i) => `${i + 1}. ${s.title}${s.slug ? ` \`${s.slug}\`` : ''}`).join('\n')}

## Pendientes

- [ ] Generar intro/outro propios (MARCO AURELIO)
- [ ] Concatenar audios de las historias fuente (LUIS adaptado)
- [ ] Render con transiciones (LUIS)
- [ ] Miniatura propia (NORA + IRIS)
- [ ] Título y descripción específicos (MARCOS + SEO)
- [ ] DECISIÓN PABLO: orden definitivo de las historias
`;
  await writeFile(path.join(folderPath, '_PACKAGING', 'packaging.md'), packagingMd, 'utf-8');

  return NextResponse.json({
    ok: true,
    compilation: {
      title,
      folderName,
      folderPath: folderPath.replace(/\\/g, '/'),
      level,
      sources: metadata.sources,
    },
  });
}
