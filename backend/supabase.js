const { createClient } = require('@supabase/supabase-js');

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Node 20 has no global WebSocket, but supabase-js v2.98+ resolves a WebSocket
// constructor while building each client (even though this server never opens
// realtime channels). Pass a stub so createClient works on Node 20/22 alike.
class StubWebSocket {
  constructor() { this.readyState = 3; /* CLOSED */ }
  close() {}
  send() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return false; }
}
const realtimeOptions = { transport: StubWebSocket };

// Service-role client for privileged cross-user queries (replaces lib/supabase/admin.ts).
function getAdmin() {
  return createClient(URL, SERVICE, {
    realtime: realtimeOptions,
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// User-scoped client that carries the caller's JWT (replaces lib/supabase/server.ts).
function getUserClient(token) {
  return createClient(URL, ANON, {
    realtime: realtimeOptions,
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getUserFromToken(token) {
  const supabase = getUserClient(token);
  // Pass the bearer token explicitly. `getUser()` does not reliably read the
  // client-wide Authorization header in every Supabase JS runtime.
  const { data } = await supabase.auth.getUser(token);
  return { user: data.user || null, supabase };
}

module.exports = { getAdmin, getUserClient, getUserFromToken };
