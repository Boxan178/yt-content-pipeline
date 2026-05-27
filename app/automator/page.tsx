// Server wrapper. force-dynamic obliga a que cada request pase por el server
// (no cacheo estático), necesario para que cuando añadamos auth/middleware se
// ejecute en cada request.

import AutomatorClient from "./page-client";

export const dynamic = "force-dynamic";

export default function AutomatorPage() {
  return <AutomatorClient />;
}
