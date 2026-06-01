import { NextResponse, type NextRequest } from 'next/server';

// Auth por TOKEN COMPARTIDO sobre /api/*. El token vive en
// ~/.yt-content-pipeline/api-token.txt y Electron lo inyecta como YTCP_API_TOKEN
// al arrancar el server standalone (.exe). Si NO hay token configurado (p.ej.
// `next dev` sin la env), la auth queda DESHABILITADA (fail-open) para no romper
// el flujo de desarrollo — protege la superficie SIEMPRE-VIVA y expuesta (el .exe
// escuchando en 0.0.0.0 / accesible por Tailscale/LAN), que es la que importa.
//
// Cómo autentican los clientes legítimos:
//  - Renderer de Electron: cookie `ytcp_auth` (la setea electron/main en la sesión).
//  - Pollers de Electron: header `x-ytcp-token`.
//  - Navegador externo (Tailscale/LAN): visita una URL con `?_t=<token>` UNA vez
//    → se setea la cookie y a partir de ahí la app funciona normal.
// Las PÁGINAS no se bloquean (la UI sin datos no filtra nada); solo /api/* exige
// token, así que un anónimo carga el cascarón pero no obtiene datos ni dispara nada.

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export function middleware(req: NextRequest) {
  const token = process.env.YTCP_API_TOKEN || '';
  if (!token) return NextResponse.next(); // auth deshabilitada (sin token configurado)

  const { pathname, searchParams } = req.nextUrl;
  const headerTok = req.headers.get('x-ytcp-token');
  const cookieTok = req.cookies.get('ytcp_auth')?.value;
  const authed = headerTok === token || cookieTok === token;

  // Bootstrap para navegadores: ?_t=<token> en cualquier ruta setea la cookie.
  if (!authed && searchParams.get('_t') === token) {
    const res = NextResponse.next();
    res.cookies.set('ytcp_auth', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  }

  // Solo /api/* requiere auth. Las páginas se sirven igual (para poder cargar la
  // UI y bootstrapear con ?_t=); sus fetch a /api/* sí van gated.
  if (pathname.startsWith('/api/') && !authed) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.next();
}
