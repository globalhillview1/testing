// Cloudflare Pages Worker — API proxy only (no path rewrites that can loop)
const GAS_API = 'https://script.google.com/macros/s/AKfycbzxi94OUhTg1k2kQCV4DbtvsGVDEn4txrNDlNCqFq6u6uPxeMLIMWql5U9blc7RNJ2f4A/exec';

/** Helper to set CORS headers **/
function corsHeaders(h = new Headers()) {
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  return h;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy /api to GAS, preserving method, query, and body
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        
      // 0. Handle CORS Preflight (OPTIONS request)
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
        
      const upstream = new URL(GAS_API);
      
      // 1. Append all query parameters from the client request to the GAS URL
      for (const [k, v] of url.searchParams.entries()) upstream.searchParams.set(k, v);

      const headers = new Headers(request.headers);
      
      // 2. CRITICAL: Remove Content-Length and Host headers for proxying
      // Content-Length can cause body stream issues. Host must be the original GAS host.
      if (headers.has('Content-Length')) {
          headers.delete('Content-Length');
      }
      headers.delete('Host'); // Ensure the Host header is correct for GAS

      // 3. Create a new Request object for the upstream call. 
      const proxyRequest = new Request(upstream.toString(), {
          method: request.method,
          headers: headers,
          redirect: 'manual',
          body: request.body, // Pass the request body stream directly
          // Disable keepalive for Cloudflare Pages (best practice)
          cf: { cacheTtlByStatus: { '200-299': -1, '400-599': 0 } }
      });

      try {
        const res = await fetch(proxyRequest);
        
        // 4. Pass the response back to the client, adding CORS headers
        return new Response(res.body, { 
            status: res.status, 
            statusText: res.statusText, 
            headers: corsHeaders(new Headers(res.headers)) 
        });
      } catch (e) {
        // Return a 500 status to the client if the upstream fetch fails
        return new Response(JSON.stringify({ ok: false, error: `Proxy failed to connect to GAS: ${e.message}` }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Everything else (static assets)
    return env.ASSETS.fetch(request);
  }
};
