const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
};

export default {
  async fetch(request, env, ctx) {

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // ── IMAGE PROXY ROUTE ──
    // GET /?img=<encoded_image_url> → fetches image, returns with CORS headers
    // GET /?img=<encoded_image_url>&b64=1 → returns { dataUrl: "data:image/jpeg;base64,..." }
    if (request.method === 'GET' && url.searchParams.has('img')) {
      const imgUrl = url.searchParams.get('img');
      const asBase64 = url.searchParams.get('b64') === '1';
      try {
        const resp = await fetch(imgUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://notrojan.com' }
        });
        const contentType = resp.headers.get('Content-Type') || 'image/jpeg';
        const buffer = await resp.arrayBuffer();
        if (asBase64) {
          // Convert to base64 data URL — can't be blocked by browser security
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          const b64 = btoa(binary);
          const dataUrl = `data:${contentType};base64,${b64}`;
          return new Response(JSON.stringify({ dataUrl }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        return new Response(buffer, {
          headers: {
            ...corsHeaders,
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
          }
        });
      } catch (e) {
        return new Response(asBase64 ? JSON.stringify({ dataUrl: null }) : 'Image fetch failed', {
          status: 500, headers: corsHeaders
        });
      }
    }

    // ── IMAGE LOOKUP ROUTE ──
    // GET /?q=Nicki+Minaj → { imageUrl: "https://..." }
    if (request.method === 'GET' && url.searchParams.has('q')) {
      const query = url.searchParams.get('q');
      try {
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&skip_disambig=1`;
        const resp = await fetch(ddgUrl, {
          headers: { 'User-Agent': 'NoTrojanScanner/1.0 (notrojan.com)' }
        });
        const data = await resp.json();
        const img = data?.Image || '';
        const imageUrl = img && img.startsWith('/i/') ? 'https://duckduckgo.com' + img : null;
        return new Response(JSON.stringify({ imageUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ imageUrl: null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ── ANTHROPIC API ROUTE ──
    if (request.method === 'POST') {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: 'API key not configured.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let body;
      try {
        body = await request.json();
        body.temperature = 0;
      } catch (e) {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON in request body.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      const result = await anthropicResp.json();
      return new Response(JSON.stringify(result), {
        status: anthropicResp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed. Use POST.', {
      status: 405,
      headers: corsHeaders
    });
  }
};
