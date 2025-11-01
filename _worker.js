// Cloudflare Pages Worker — API proxy only (no path rewrites that can loop)
const GAS_API = 'https://script.google.com/macros/s/AKfycbzxi94OUhTg1k2kQCV4DbtvsGVDEn4txrNDlNCqFq6u6uPxeMLIMWql5U9blc7RNJ2f4A/exec';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy /api to GAS, preserving method, query, and body
    if (url.pathname === '/api') {
      const upstream = new URL(GAS_API);
      // Append all query parameters from the client request to the GAS URL
      for (const [k, v] of url.searchParams.entries()) upstream.searchParams.set(k, v);

      const init = {
        method: request.method,
        headers: new Headers(request.headers),
        redirect: 'manual',
        // Only include body for POST/PUT/PATCH methods
        body: (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') ? request.body : undefined
      };
      
      // CRITICAL FIX: The request body is streamed, so we must remove 
      // the original Content-Length header to prevent issues with the stream.
      // This is a common requirement when proxying requests in Cloudflare Workers.
      if (init.headers.has('Content-Length')) {
          init.headers.delete('Content-Length');
      }
      
      init.headers.set('accept', 'application/json');

      try {
        const res = await fetch(upstream.toString(), init);
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
      } catch (e) {
        // Return a 500 status to the client if the upstream fetch fails
        // This is a clearer error signal than a general 'Network error.'
        return new Response(JSON.stringify({ ok: false, error: `Proxy failed to connect: ${e.message}` }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Everything else (/, /login, /login/, /login.html, CSS/JS/etc.)
    // is served by the static asset pipeline (Clean URLs enabled)
    return env.ASSETS.fetch(request);
  }
};
