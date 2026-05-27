// Helper para convertir un output_path absoluto del VPS en una URL descargable
// desde la web (proxy /api/files/...).
//
// Ejemplos:
//   /var/lib/yt-automator/output/test-stoic-01/images/scene-001-busto.jpg
//   → /api/files/test-stoic-01/images/scene-001-busto.jpg
//
//   /var/lib/yt-automator/output/proj/videos/scene-002.mp4
//   → /api/files/proj/videos/scene-002.mp4

const ABS_RE = /\/var\/lib\/yt-automator\/output\/([^/]+)\/(images|videos)\/(.+)$/;
const WIN_RE = /[\\/]yt-automator[\\/]([^\\/]+)[\\/](images|videos)[\\/](.+)$/;

export function buildDownloadUrl(absPath: string | undefined): string | null {
  if (!absPath) return null;
  const norm = absPath.replace(/\\/g, "/");
  const match = ABS_RE.exec(norm) ?? WIN_RE.exec(norm);
  if (!match) return null;
  return `/api/files/${encodeURIComponent(match[1])}/${match[2]}/${encodeURIComponent(match[3])}`;
}
