// Middleware de protección avanzada para Cloudflare Pages
// 19 CAPAS DE SEGURIDAD + PERFORMANCE:
// 1. Referer Checking
// 2. Browser Fingerprinting
// 3. Rate Limiting (Por Minuto)
// 4. Timing Attack Detection (Velocidad entre requests)
// 5. CSP Headers
// 6. Request Method Validation
// 7. User-Agent Validation
// 8. Bot Blocking
// 9. Request Order Validation
// 10. Geo/IP Challenge (UY/BR/Bots OK, resto JS Challenge)
// 11. Cache-Control Optimizado
// 12. Compression Headers
// 13. Cache Poisoning Protection
// 14. Cache API Control
// 15. Mini-WAF (Bloqueo de patrones maliciosos)
// 16. Velocity Attack Detection (Volumen de requests)
// 17. HSTS & Permissions-Policy Headers
// 18. ASN / Datacenter Blocking
// 19. MIME Type Forcing & Dangerous Type Blocking

// === RATE LIMITING (Dual: Maps + Cache API) ===
// IMPORTANTE: Mantenemos AMBAS implementaciones:
// 1. Maps en memoria: Funciona para múltiples requests en el MISMO worker (backup)
// 2. Cache API: Persiste entre DIFERENTES workers (principal)

const rateLimitMap = new Map();
const timingTrackingMap = new Map();
const velocityAttackMap = new Map();
const htmlLoadTrackingMap = new Map();

const RATE_LIMITS = {
  js_css: 12,    // JS y CSS: 12 req/min
  images: 30,    // Imágenes: 30 req/min
  window: 60000  // Ventana de 1 minuto (60,000ms)
};

const TIMING_CONFIG = {
  threshold: 400,    // 400ms - ventana de tiempo
  minRequests: 10,     // 10 requests - número mínimo
  trackingWindow: 1000 // 1000ms - ventana de seguimiento
};

const VELOCITY_CONFIG = {
  requests: 25,    // 25 requests (suficiente para 8 archivos + margen de seguridad)
  window: 10000    // 10 segundos (10,000ms)
};

const ORDER_CONFIG = {
  htmlLoadWindow: 60000 // 60 segundos
};

// === FUNCIONES DE RATE LIMITING ===

// VERSIÓN 1: Maps en memoria (backup, funciona solo en mismo worker)
function checkRateLimitMaps(ip, resourceType) {
  const now = Date.now();
  const limit = resourceType === 'image' ? RATE_LIMITS.images : RATE_LIMITS.js_css;
  
  let ipData = rateLimitMap.get(ip);
  
  if (!ipData || now > ipData.resetTime) {
    ipData = {
      count: 0,
      resetTime: now + RATE_LIMITS.window
    };
    rateLimitMap.set(ip, ipData);
  }
  
  ipData.count++;
  
  if (ipData.count > limit) {
    const remaining = Math.ceil((ipData.resetTime - now) / 1000);
    return {
      allowed: false,
      remaining: remaining,
      limit: limit,
      count: ipData.count
    };
  }
  
  return { allowed: true, count: ipData.count };
}

function checkTimingAttackMaps(ip) {
  const now = Date.now();
  let timestamps = timingTrackingMap.get(ip) || [];
  
  timestamps = timestamps.filter(t => now - t < TIMING_CONFIG.trackingWindow);
  timestamps.push(now);
  timingTrackingMap.set(ip, timestamps);
  
  if (timestamps.length >= TIMING_CONFIG.minRequests) {
    let suspiciousCount = 0;
    for (let i = 1; i < timestamps.length; i++) {
      const timeDiff = timestamps[i] - timestamps[i - 1];
      if (timeDiff < TIMING_CONFIG.threshold) {
        suspiciousCount++;
      }
    }
    
    if (suspiciousCount >= TIMING_CONFIG.minRequests - 1) {
      return {
        isBot: true,
        requestCount: timestamps.length,
        suspiciousCount: suspiciousCount
      };
    }
  }
  
  return { isBot: false };
}

function checkVelocityAttackMaps(ip) {
  const now = Date.now();
  let timestamps = velocityAttackMap.get(ip) || [];
  
  timestamps = timestamps.filter(t => (now - t) < VELOCITY_CONFIG.window);
  timestamps.push(now);
  velocityAttackMap.set(ip, timestamps);
  
  if (timestamps.length > VELOCITY_CONFIG.requests) {
    return {
      blocked: true,
      count: timestamps.length,
      window: VELOCITY_CONFIG.window / 1000
    };
  }
  
  return { blocked: false };
}

function checkRequestOrderMaps(ip, isHTML) {
  const now = Date.now();
  
  if (isHTML) {
    htmlLoadTrackingMap.set(ip, now);
    return { allowed: true };
  }
  
  const htmlLoadTime = htmlLoadTrackingMap.get(ip);
  
  if (!htmlLoadTime || (now - htmlLoadTime) > ORDER_CONFIG.htmlLoadWindow) {
    return {
      allowed: false,
      reason: !htmlLoadTime ? 'No HTML loaded' : 'HTML load expired'
    };
  }
  
  return { allowed: true };
}

// VERSIÓN 2: Cache API (principal, persiste entre workers)
// Rate Limiting con Cache API (persiste entre workers)
async function checkRateLimitWithCache(ip, resourceType) {
  const cache = caches.default;
  const limit = resourceType === 'image' ? RATE_LIMITS.images : RATE_LIMITS.js_css;
  const windowSeconds = RATE_LIMITS.window / 1000; // 60 segundos
  
  // Crear cache key única por IP y ventana de tiempo
  const timeWindow = Math.floor(Date.now() / RATE_LIMITS.window);
  const cacheKey = new Request(`https://ratelimit.internal/${resourceType}/${ip}/${timeWindow}`);
  
  try {
    // Leer contador actual del cache
    let count = 0;
    const cached = await cache.match(cacheKey);
    
    if (cached) {
      const text = await cached.text();
      count = parseInt(text) || 0;
    }
    
    // Incrementar contador
    count++;
    
    // Verificar si excede el límite
    if (count > limit) {
      const now = Date.now();
      const windowStart = timeWindow * RATE_LIMITS.window;
      const remaining = Math.ceil((windowStart + RATE_LIMITS.window - now) / 1000);
      
      return {
        allowed: false,
        remaining: remaining > 0 ? remaining : 1,
        limit: limit,
        count: count
      };
    }
    
    // Guardar nuevo contador en cache con TTL
    await cache.put(
      cacheKey,
      new Response(count.toString(), {
        headers: {
          'Cache-Control': `max-age=${windowSeconds}`,
          'Content-Type': 'text/plain'
        }
      })
    );
    
    return { allowed: true, count: count };
    
  } catch (error) {
    // Si falla Cache API, usar Maps como fallback
    console.warn('Cache API falló, usando Maps:', error);
    return checkRateLimitMaps(ip, resourceType);
  }
}

// Timing Attack Detection con Cache API
async function checkTimingAttackWithCache(ip) {
  const cache = caches.default;
  const now = Date.now();
  const windowKey = Math.floor(now / TIMING_CONFIG.trackingWindow);
  const cacheKey = new Request(`https://timing.internal/${ip}/${windowKey}`);
  
  try {
    let timestamps = [];
    const cached = await cache.match(cacheKey);
    
    if (cached) {
      const text = await cached.text();
      timestamps = JSON.parse(text);
    }
    
    // Filtrar timestamps antiguos y agregar el actual
    timestamps = timestamps.filter(t => now - t < TIMING_CONFIG.trackingWindow);
    timestamps.push(now);
    
    // Guardar timestamps
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(timestamps), {
        headers: {
          'Cache-Control': 'max-age=2',
          'Content-Type': 'application/json'
        }
      })
    );
    
    // Detectar patrón de timing attack
    if (timestamps.length >= TIMING_CONFIG.minRequests) {
      let suspiciousCount = 0;
      for (let i = 1; i < timestamps.length; i++) {
        const timeDiff = timestamps[i] - timestamps[i - 1];
        if (timeDiff < TIMING_CONFIG.threshold) {
          suspiciousCount++;
        }
      }
      
      if (suspiciousCount >= TIMING_CONFIG.minRequests - 1) {
        return {
          isBot: true,
          requestCount: timestamps.length,
          suspiciousCount: suspiciousCount
        };
      }
    }
    
    return { isBot: false };
    
  } catch (error) {
    // Si falla Cache API, usar Maps como fallback
    console.warn('Timing attack cache falló, usando Maps:', error);
    return checkTimingAttackMaps(ip);
  }
}

// === MIME TYPE MAPPING (CAPA 19) ===
const MIME_TYPES = {
  // Web
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  
  // Imágenes
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  
  // Fuentes
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  
  // Documentos
  '.pdf': 'application/pdf',
  
  // Otros
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json'
};

// MIME Types peligrosos bloqueados (CAPA 19)
const DANGEROUS_MIME_TYPES = [
  'application/x-msdownload',          // .exe
  'application/x-msdos-program',       // .com
  'application/x-msi',                 // .msi
  'application/x-sh',                  // .sh
  'application/x-csh',                 // .csh
  'application/x-perl',                // .pl
  'application/x-python-code',         // .pyc
  'application/x-httpd-php',           // .php
  'application/x-httpd-php-source',    // .phps
  'application/x-java-applet',         // .jar
  'application/x-dosexec',             // .dll
  'application/x-executable',          // binarios
  'application/x-shockwave-flash',     // .swf (Flash - obsoleto y peligroso)
  'text/x-shellscript',                // scripts shell
  'text/x-python',                     // .py
  'text/x-perl',                       // .pl
  'application/x-chrome-extension',    // .crx
  'application/vnd.microsoft.portable-executable' // PE
];

// Función para obtener MIME type correcto (CAPA 19)
function getCorrectMimeType(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  const ext = pathname.substring(pathname.lastIndexOf('.'));
  return MIME_TYPES[ext] || null;
}

// Función para verificar si es MIME type peligroso (CAPA 19)
function isDangerousMimeType(mimeType) {
  if (!mimeType) return false;
  const normalizedMime = mimeType.toLowerCase().split(';')[0].trim();
  return DANGEROUS_MIME_TYPES.some(dangerous => normalizedMime === dangerous.toLowerCase());
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const referer = request.headers.get('Referer') || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const ip = request.headers.get('CF-Connecting-IP') || 
           request.headers.get('X-Forwarded-For') || 
           'unknown';
  
  // === BOTS DE BÚSQUEDA (Definir temprano) ===
  const allowedBots = [
    // Google
    'googlebot', 'google-inspectiontool', 'googlebot-image', 'googlebot-video',
    'adsbot-google', 'google-read-aloud', 'google-site-verification',
    // Bing / Microsoft
    'bingbot', 'bingpreview', 'msnbot',
    // Redes Sociales
    'facebookexternalhit', 'facebookcatalog',
    'twitterbot', 'slackbot', 'whatsapp',
    'linkedinbot', 'pinterestbot'
  ];
  const isSearchBot = allowedBots.some(bot => userAgent.toLowerCase().includes(bot));

  // === BYPASS PARA CACHE WARMING BOT ===
  if (userAgent.includes('CacheWarmer/1.0') || 
      url.pathname.startsWith('/api/warm')) {
    return next();
  }
  
  // === BYPASS PARA SITEMAP.XML ===
  if (url.pathname === '/sitemap.xml') {
    return next();
  }

  // === VALIDACIÓN DE REQUEST METHOD GLOBAL (CAPA 6) ===
  // Permitir GET, HEAD y OPTIONS (preflight)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return new Response('Method Not Allowed', {
      status: 405, 
      headers: { 
        'Allow': 'GET, HEAD, OPTIONS', 
        'Cache-Control': 'no-store' 
      }
    });
  }

  // === MINI-WAF (CAPA 15) ===
  const maliciousPaths = [
    '/.env', '/.git', '/.aws', '/wp-admin', '/wp-login', 
    '/xmlrpc.php', '/config.json', '/.htaccess'
  ];
  const maliciousQueries = [
    '<script>', 'UNION SELECT', 'CONCAT(', 'base64_decode', 
    'etc/passwd', 'alert(', 'eval('
  ];
  
  // 1. Bloquear paths maliciosos
  const lowerPathname = url.pathname.toLowerCase();
  if (maliciousPaths.some(path => lowerPathname.includes(path))) {
    return new Response('Forbidden', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }
  
  // 2. Bloquear query strings maliciosos
  const queryString = url.search.toLowerCase();
  if (maliciousQueries.some(query => queryString.includes(query))) {
    return new Response('Forbidden', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }

  // === (NUEVO) BLOQUEO DE DATACENTERS (ASN) (CAPA 18) ===
  // Bloquear tráfico de servidores (AWS, Azure, etc.) y TOR.
  // ⚠️ IMPORTANTE: NO bloqueamos 'google' para proteger Googlebot
  // Googlebot viene de ASN "Google LLC" pero está protegido por isSearchBot
  const asnOrg = request.cf?.asOrganization || '';
  const lowerAsnOrg = asnOrg.toLowerCase();

  const blockedAsnOrgs = [
    'amazon', // Bloquea AWS
    'microsoft corporation', // Bloquea Azure
    // 'google llc', // Se elimina para evitar bloquear Google Cloud y posibles falsos positivos. La protección de bots ya cubre a Googlebot.
    'oracle', 
    'digitalocean', 
    'hetzner', 
    'ovh',
    'linode',
    'vultr',
    'tencent',
    'alibaba',
    'tor exit' // Bloquea salidas de TOR
    // ⚠️ Googlebot viene de 'google llc' pero tiene bypass con isSearchBot
  ];

  // Aplicar bloqueo solo si NO es un bot de búsqueda verificado
  // Y si ASN está en la lista de bloqueados
  if (!isSearchBot && blockedAsnOrgs.some(org => lowerAsnOrg.includes(org))) {
    return new Response('Forbidden', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }

  // === VELOCITY ATTACK DETECTION (CAPA 16) - APLICADO GLOBALMENTE ===
  // Mover aquí para proteger HTML y assets
  // Exceptuar bots legítimos
  if (!isSearchBot) {
    const velocityResult = checkVelocityAttackMaps(ip);
    
    if (velocityResult.blocked) {
      return new Response(
        `Too Many Requests`,
        {
          status: 429,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Retry-After': '60',
            'Cache-Control': 'no-store'
          }
        }
      );
    }
  }

  // === GEO/IP CHALLENGE (CAPA 10) ===
  // Aplicado globalmente - Uruguay, Brasil y bots verificados pasan sin challenge
  const country = request.headers.get('CF-IPCountry');
  const allowedCountries = ['UY', 'BR']; // Uruguay y Brasil sin challenge
  
  if (allowedCountries.includes(country) || isSearchBot) {
    // ✅ Tráfico de Uruguay, Brasil o Bot Verificado pasa directamente
  } else {
    // ⚠️ Todo el resto del mundo: JS Challenge
    const cookies = request.headers.get('Cookie') || '';
    
    // Debug: Log cookies recibidas
    console.log('🔍 Geo Challenge - Country:', country, 'Cookies:', cookies);
    
    // Buscar cookie de clearance con regex más flexible
    const hasClearanceCookie = /cf_js_clearance=verified_\d+/.test(cookies);
    
    console.log('🔍 Has clearance cookie:', hasClearanceCookie);
    
    if (!hasClearanceCookie) {
      // Enviar JavaScript Challenge
      const challenge = Math.floor(Math.random() * 1000);
      const solution = challenge * 2;
      
      console.log('🚨 Enviando JS Challenge para IP:', ip, 'Country:', country);
      
      return new Response(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Verificación Avanzada</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #333; }
    .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #e74c3c; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .debug { margin-top: 20px; padding: 10px; background: #f0f0f0; border-radius: 5px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🛡️ Verificación Avanzada</h1>
    <p>Realizando verificación de seguridad...</p>
    <div class="spinner"></div>
    <p><small>Este proceso es automático</small></p>
    <div id="debug" class="debug">Preparando verificación...</div>
  </div>
  <script>
    const debugDiv = document.getElementById('debug');
    
    function updateDebug(msg) {
      debugDiv.textContent = msg;
      console.log(msg);
    }
    
    const challenge = ${challenge};
    const solution = challenge * 2;
    
    updateDebug('Challenge: ' + challenge + ' = ' + solution);
    
    if (solution === ${solution}) {
      // Setear cookie con múltiples formatos para compatibilidad
      const cookieValue = "cf_js_clearance=verified_" + solution;
      const cookieParams = "; path=/; max-age=300; SameSite=Lax"; // 5 minutos = 300 segundos
      
      // Intentar con y sin Secure flag (en caso de que afecte)
      if (window.location.protocol === 'https:') {
        document.cookie = cookieValue + cookieParams + "; Secure";
        updateDebug('Cookie seteada (HTTPS): ' + cookieValue);
      } else {
        document.cookie = cookieValue + cookieParams;
        updateDebug('Cookie seteada (HTTP): ' + cookieValue);
      }
      
      // Verificar que la cookie se guardó
      setTimeout(() => {
        const savedCookies = document.cookie;
        updateDebug('Cookies guardadas: ' + savedCookies);
        
        if (savedCookies.includes('cf_js_clearance=verified_')) {
          updateDebug('✅ Cookie verificada! Redirigiendo...');
          
          // Forzar recarga con cache bypass
          setTimeout(() => {
            window.location.href = window.location.href + '?t=' + Date.now();
          }, 500);
        } else {
          updateDebug('❌ Error: Cookie no se guardó. Reintentando...');
          setTimeout(() => window.location.reload(), 2000);
        }
      }, 200);
    } else {
      document.body.innerHTML = '<div class="container"><h1>❌ Verificación Fallida</h1><p>No se pudo completar la verificación.</p></div>';
    }
  </script>
</body>
</html>`,
        {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Challenge-Type': 'JavaScript Challenge (Geo)',
            'X-Country': country || 'unknown'
          }
        }
      );
    }
    
    // Si ya tiene la cookie del challenge, continúa
    console.log('✅ Geo Challenge pasado - Cookie válida para IP:', ip);
  }

  // === PROTECCIÓN CONTRA CACHE POISONING (CAPA 13) ===
  const host = request.headers.get('Host') || '';
  const validHosts = ['calefonesuruguay.uy', 'www.calefonesuruguay.uy'];
  const isValidHost = validHosts.some(validHost => host === validHost || host.endsWith('.pages.dev'));
  
  if (!isValidHost && host !== '') {
    console.warn('⚠️ CACHE POISONING ATTEMPT: Invalid Host', {
      ip: ip,
      host: host,
      userAgent: userAgent,
      timestamp: new Date().toISOString()
    });
    return new Response('Bad Request', {
      status: 400,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }
  
  const forwardedHost = request.headers.get('X-Forwarded-Host');
  if (forwardedHost && forwardedHost !== host) {
    console.warn('⚠️ CACHE POISONING ATTEMPT: X-Forwarded-Host mismatch', {
      ip: ip,
      host: host,
      forwardedHost: forwardedHost,
      timestamp: new Date().toISOString()
    });
    return new Response('Bad Request', {
      status: 400,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }
  
  const dangerousHeaders = [
    'X-Original-URL', 'X-Rewrite-URL', 'X-Host', 'X-Forwarded-Scheme'
  ];
  
  for (const header of dangerousHeaders) {
    if (request.headers.get(header)) {
      console.warn('⚠️ CACHE POISONING ATTEMPT: Dangerous header', {
        ip: ip,
        header: header,
        value: request.headers.get(header),
        timestamp: new Date().toISOString()
      });
      return new Response('Bad Request', {
        status: 400,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    }
  }
  
  const suspiciousParams = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'];
  const cleanUrl = new URL(url);
  suspiciousParams.forEach(param => cleanUrl.searchParams.delete(param));
  
  // === CLOUDFLARE CACHE API (CAPA 14) ===
  const cache = caches.default;
  const cacheKey = new Request(cleanUrl.toString(), request);
  let cachedResponse = await cache.match(cacheKey);
  
  if (cachedResponse) {
    const headers = new Headers(cachedResponse.headers);
    headers.set('X-Cache-Status', 'HIT');
    headers.set('X-Cache-Key', cleanUrl.pathname);
    
    return new Response(cachedResponse.body, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers: headers
    });
  }
  
  // === SECCIÓN DE RECURSOS PROTEGIDOS (Assets) ===
  const protectedExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'];
  const isProtectedResource = protectedExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext));
  const isHTML = url.pathname.endsWith('.html') || url.pathname === '/' || !url.pathname.includes('.');
  
  // Declarar secFetchSite una sola vez para todo el middleware
  const secFetchSite = request.headers.get('Sec-Fetch-Site');
  const isSameOrigin = secFetchSite === 'same-origin' || secFetchSite === 'same-site';
  
  if (isProtectedResource) {
    // La validación de método ya se hizo globalmente arriba
    
    // === VALIDACIÓN DE USER-AGENT (CAPA 7) ===
    if (!userAgent || userAgent.trim() === '' || userAgent.length < 5) {
      return new Response('Forbidden', {
        status: 403, headers: { 'Cache-Control': 'no-store' }
      });
    }
    
    // Aplicar límites solo a no-bots
    if (!isSearchBot) {
      // === RATE LIMITING (POR MINUTO) (CAPA 3) - CON CACHE API ===
      const isImage = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'].some(ext => 
        url.pathname.toLowerCase().endsWith(ext)
      );
      const resourceType = isImage ? 'image' : 'js_css';
      const rateLimitResult = await checkRateLimitWithCache(ip, resourceType);
      
      if (!rateLimitResult.allowed) {
        return new Response('Too Many Requests', {
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.remaining.toString(),
            'Cache-Control': 'no-store'
          }
        });
      }
      
      // === TIMING ATTACK DETECTION (CAPA 4) - CON CACHE API ===
      const timingResult = await checkTimingAttackWithCache(ip);
      if (timingResult.isBot) {
        return new Response('Too Many Requests', {
          status: 429,
          headers: {
            'Retry-After': '10',
            'Cache-Control': 'no-store'
          }
        });
      }
      
      // === REQUEST ORDER VALIDATION (CAPA 9) ===
      // Usar secFetchSite ya declarado antes
      const isSameOriginResource = isSameOrigin;
      
      // Solo validar orden si NO es same-origin (recursos legítimos del navegador se permiten)
      if (!isSameOriginResource) {
        const orderResult = checkRequestOrderMaps(ip, false);
        if (!orderResult.allowed) {
          return new Response('Forbidden', {
            status: 403,
            headers: {
              'Cache-Control': 'no-store'
            }
          });
        }
      }
    }
    
    // === BOT BLOCKING (CAPA 8) ===
    // Lista extensa de navegadores sin cabeza y scrapers maliciosos
    const blockedBots = [
      // CLI Tools
      'wget', 'curl', 'libwww-perl', 'http_request', 'httpie',
      
      // Scrapers y frameworks de scraping
      'scrapy', 'beautifulsoup', 'mechanize', 'jsoup', 'htmlunit',
      'phantomjs', 'slimerjs', 'casperjs',
      
      // Navegadores sin cabeza (headless browsers)
      'headlesschrome', 'chromeheadless', 'headless', 'chrome-lighthouse',
      'puppeteer', 'playwright', 'selenium', 'webdriver',
      'chromedriver', 'geckodriver', 'safaridriver', 'edgedriver',
      
      // Librerías HTTP de programación
      'python-requests', 'python-urllib', 'python-httpx',
      'go-http-client', 'java/', 'apache-httpclient',
      'okhttp', 'node-fetch', 'axios/', 'got/', 'superagent',
      
      // SEO/Marketing bots maliciosos (NO incluir Google/Bing aquí)
      'ahrefsbot', 'semrushbot', 'mj12bot', 'dotbot', 'blexbot',
      'barkrowler', 'seoscanners', 'petalbot', 'proximic', 'brandwatch',
      
      // Otros scrapers conocidos
      'heritrix', 'ia_archiver', 'archive.org_bot', 'nutch', 'grapeshot',
      'embedly', 'quora-bot', 'outbrain', 'vkshare', 'linkdex',
      
      // Download managers
      'download', 'downloader', 'aria2', 'wget', 'curl',
      
      // Testing tools
      'apachebench', 'jmeter', 'loader.io', 'k6/', 'bombardier'
    ];
    
    // IMPORTANTE: Solo bloquear si NO es un bot verificado
    // Esto protege bots legítimos (Google, Bing, etc.) incluso si usan headless
    if (!isSearchBot) {
      const isBadBot = blockedBots.some(bot => userAgent.toLowerCase().includes(bot));
      if (isBadBot) {
        return new Response('Forbidden', {
          status: 403, 
          headers: { 
            'Cache-Control': 'no-store' 
          }
        });
      }
    }
    
    // === BROWSER FINGERPRINTING (CAPA 2) ===
    const hasValidReferer = ['calefonesuruguay.uy', 'www.calefonesuruguay.uy', 'localhost'].some(domain => referer.includes(domain));
    const acceptLanguage = request.headers.get('Accept-Language');
    const acceptEncoding = request.headers.get('Accept-Encoding');
    
    // Usar secFetchSite y isSameOrigin ya declarados antes
    
    let browserScore = 0;
    if (acceptLanguage) browserScore++;
    if (acceptEncoding && (acceptEncoding.includes('gzip') || acceptEncoding.includes('deflate'))) browserScore++;
    if (secFetchSite) browserScore += 2;
    if (isSameOrigin) browserScore++;
    
    // === REFERER CHECKING (CAPA 1) ===
    // Permitir si: 1) Tiene referer válido, 2) Es same-origin, 3) Bot verificado, o 4) Acceso directo desde navegador
    const isDirectNavigation = !referer && secFetchSite === 'none'; // Usuario escribió URL en barra de navegación
    
    if (hasValidReferer || isSameOrigin || isSearchBot || isDirectNavigation) {
      // Validar navegador solo si NO es same-origin, bot o navegación directa
      if (!isSameOrigin && !isSearchBot && !isDirectNavigation && browserScore < 2) {
        return new Response('Forbidden', {
          status: 403, headers: { 'Cache-Control': 'no-store' }
        });
      }
      // ✅ Continuar al procesamiento de MIME (no hacer return next() aquí)
    } else {
      // Bloquear si tiene referer externo (hotlinking desde otro sitio)
      if (referer && !hasValidReferer) {
        return new Response('Forbidden', {
          status: 403, headers: { 'Cache-Control': 'no-store' }
        });
      }
      
      // Caso extraño: sin referer pero con Sec-Fetch-Site que indica cross-site
      return new Response('Forbidden', {
        status: 403, headers: { 'Cache-Control': 'no-store' }
      });
    }
  }
  
  // === SECCIÓN DE RESPUESTA (HTML, etc.) ===
  
  // Para HTML y otros recursos, continuar normalmente
  const response = await next();
  
  // Registrar carga de HTML
  if (isHTML && response.status === 200) {
    checkRequestOrderMaps(ip, true);
  }
  
  // Clonar headers para modificar
  const newHeaders = new Headers(response.headers);
  
  // === MIME TYPE FORCING & DANGEROUS TYPE BLOCKING (CAPA 19) ===
  const currentMimeType = response.headers.get('Content-Type');
  
  // 1. Bloquear MIME types peligrosos
  if (isDangerousMimeType(currentMimeType)) {
    console.warn(`🚨 MIME peligroso bloqueado: ${currentMimeType} desde IP: ${ip}`);
    return new Response('Forbidden', {
      status: 403,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain'
      }
    });
  }
  
  // 2. Forzar MIME type correcto según extensión
  const correctMimeType = getCorrectMimeType(url);
  if (correctMimeType) {
    newHeaders.set('Content-Type', correctMimeType);
    
    // Logging para debug (opcional)
    if (currentMimeType && currentMimeType !== correctMimeType) {
      console.log(`🔧 MIME corregido: ${currentMimeType} → ${correctMimeType} para ${url.pathname}`);
    }
  }
  
  // Headers de Seguridad Básicos
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('X-Frame-Options', 'SAMEORIGIN');
  newHeaders.set('X-XSS-Protection', '1; mode=block');
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS (Strict-Transport-Security) (CAPA 17)
  newHeaders.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  
  // Permissions-Policy (CAPA 17)
  newHeaders.set(
    'Permissions-Policy', 
    "camera=(), microphone=(), geolocation=(), " +
    "accelerometer=(), autoplay=(), " +
    "clipboard-write=(), encrypted-media=(), "
  );

  // CONTENT-SECURITY-POLICY (CAPA 5)
  // Solo aplicar CSP al HTML, NO a recursos individuales (JS/CSS)
  const contentType = response.headers.get('Content-Type') || '';
  
  if (contentType.includes('text/html')) {
    newHeaders.set('Content-Security-Policy', 
      "default-src 'self' https://calefonesuruguay.uy https://www.calefonesuruguay.uy; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' " +
        "https://calefonesuruguay.uy " +
        "https://www.calefonesuruguay.uy " +
        "https://api.whatsapp.com " +
        "https://www.googletagmanager.com " +
        "https://www.google-analytics.com " +
        "https://www.googleadservices.com " +
        "https://googleads.g.doubleclick.net " +
        "https://www.google.com " +
        "https://connect.facebook.net " +
        "https://www.facebook.com " +
        "https://static.cloudflareinsights.com " +
        "https://*.cloudflareinsights.com " + // Subdominios de Cloudflare Insights
        "https://challenges.cloudflare.com " +
        "https://*.challenges.cloudflare.com " + // Subdominios de challenges
        "https://challenges-api.cloudflare.com " +
        "https://cdnjs.cloudflare.com " +
        "https://*.cloudflare.com; " + // Todos los subdominios de Cloudflare
      "style-src 'self' 'unsafe-inline' " +
        "https://calefonesuruguay.uy " +
        "https://www.calefonesuruguay.uy " +
        "https://fonts.googleapis.com " +
        "https://www.google.com " +
        "https://challenges.cloudflare.com " +
        "https://*.cloudflare.com; " + // Cloudflare puede inyectar CSS en challenges
      "img-src 'self' data: https: blob:; " +
      "font-src 'self' data: https://fonts.gstatic.com; " +
      "connect-src 'self' " +
        "https://api.whatsapp.com " +
        "https://www.google-analytics.com " +
        "https://analytics.google.com " +
        "https://stats.g.doubleclick.net " +
        "https://www.googletagmanager.com " +
        "https://googleads.g.doubleclick.net " +
        "https://www.facebook.com " +
        "https://connect.facebook.net " +
        "https://graph.facebook.com " +
        "https://challenges-api.cloudflare.com " +
        "https://*.cloudflare.com " + // APIs de Cloudflare
        "https://cloudflareinsights.com " +
        "https://*.cloudflareinsights.com; " + // Subdominios de Cloudflare Insights
      "frame-src 'self' " +
        "https://www.google.com " +
        "https://td.doubleclick.net " +
        "https://www.facebook.com " +
        "https://web.facebook.com " +
        "https://challenges.cloudflare.com " +
        "https://*.challenges.cloudflare.com; " + // Subdominios de challenges en iframes
      "frame-ancestors 'self'; " +
      "base-uri 'self'; " +
      "form-action 'self' https://api.whatsapp.com/send;" // WhatsApp send
    );
  }
  // NO aplicar CSP a archivos JS/CSS individuales
  
  // CACHE-CONTROL OPTIMIZADO (CAPA 11)
  if (url.pathname.endsWith('.js')) {
    newHeaders.set('Cache-Control', 'public, max-age=7776000, immutable');
  } else if (url.pathname.endsWith('.css')) {
    newHeaders.set('Cache-Control', 'public, max-age=7776000, immutable');
  } else if (['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'].some(ext => url.pathname.endsWith(ext))) {
    newHeaders.set('Cache-Control', 'public, max-age=7776000, stale-while-revalidate=86400');
  } else if (isHTML) {
    newHeaders.set('Cache-Control', 'public, max-age=7776000, must-revalidate');
  }
  
  // COMPRESSION HEADERS (CAPA 12)
  const compressibleTypes = ['.js', '.css', '.html', '.svg', '.json', '.xml', '.txt'];
  const isCompressible = compressibleTypes.some(ext => url.pathname.endsWith(ext)) || isHTML;
  
  if (isCompressible) {
    newHeaders.set('Vary', 'Accept-Encoding');
  }
  
  // CACHE POISONING PROTECTION - Vary Header adicional (CAPA 13+)
  // Asegura que el cache de Cloudflare considere estos headers al guardar versiones
  const currentVary = newHeaders.get('Vary') || '';
  const varyHeaders = currentVary ? currentVary.split(',').map(h => h.trim()) : [];
  
  // Agregar Host al Vary para prevenir cache poisoning basado en Host header
  if (!varyHeaders.includes('Host')) {
    varyHeaders.push('Host');
  }
  
  if (varyHeaders.length > 0) {
    newHeaders.set('Vary', varyHeaders.join(', '));
  }
  
  // Headers de status del caché
  newHeaders.set('X-Cache-Status', 'MISS');
  newHeaders.set('X-Cache-Key', cleanUrl.pathname);
  newHeaders.set('X-Cache-Protection', 'active'); // Indicador de protección activa
  newHeaders.set('X-Security-Layers', '19'); // Número de capas de seguridad
  newHeaders.set('X-Middleware-Version', 'v3.0-2025-11-09'); // Versión del middleware para tracking
  
  const finalResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
  
  // GUARDAR EN CACHE API (CAPA 14)
  const shouldCache = 
    response.status === 200 &&
    request.method === 'GET' &&
    !isSearchBot &&
    (isProtectedResource || isHTML);
  
  if (shouldCache) {
    const responseToCache = finalResponse.clone();
    context.waitUntil(
      cache.put(cacheKey, responseToCache).catch(err => {
        console.error('❌ Error al cachear:', err);
      })
    );
  }
  
  return finalResponse;
}