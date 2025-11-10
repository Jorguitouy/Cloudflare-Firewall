# 🛡️ Middleware de Seguridad Avanzada - Cloudflare Pages

## 📋 Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Las 19 Capas de Seguridad](#las-19-capas-de-seguridad)
4. [Configuración y Personalización](#configuración-y-personalización)
5. [Instalación en Nuevos Proyectos](#instalación-en-nuevos-proyectos)
6. [Monitoreo y Debugging](#monitoreo-y-debugging)
7. [Troubleshooting](#troubleshooting)

---

## 🎯 Resumen Ejecutivo

Este middleware proporciona **19 capas de seguridad integradas** para sitios web alojados en **Cloudflare Pages**, diseñado específicamente para proteger contra:

- ✅ **Ataques DDoS y de alta velocidad**
- ✅ **Scrapers y bots maliciosos** (56+ patrones detectados)
- ✅ **Cache poisoning y manipulación de headers**
- ✅ **Ataques de timing y fingerprinting**
- ✅ **Acceso no autorizado desde datacenters/VPNs**
- ✅ **Hotlinking y acceso directo no deseado**
- ✅ **Inyección SQL y XSS**

### 📊 Métricas de Protección

| Métrica | Valor |
|---------|-------|
| **Capas de seguridad** | 19 |
| **Patrones de bots bloqueados** | 56+ |
| **MIME types peligrosos bloqueados** | 18 |
| **Rate limiting por IP** | Dual (Cache API + Maps) |
| **Geo-Challenge** | Configurable por país |
| **Tiempo de verificación** | 5 minutos (configurable) |

---

## 🏗️ Arquitectura del Sistema

### Sistema Dual de Rate Limiting

El middleware utiliza **dos sistemas complementarios** de rate limiting:

```
┌─────────────────────────────────────────────┐
│         REQUEST ENTRANTE (Nueva IP)         │
└────────────────┬────────────────────────────┘
                 │
                 ▼
         ┌───────────────┐
         │ Cache API (1) │ ← Principal (persiste entre workers)
         └───────┬───────┘
                 │
        ¿Funciona? ──NO──┐
                 │       │
                YES      │
                 │       ▼
                 │   ┌─────────┐
                 │   │ Maps (2)│ ← Fallback (solo en mismo worker)
                 │   └─────────┘
                 │
                 ▼
         ┌───────────────┐
         │  Rate Limit   │
         │  Verificado   │
         └───────────────┘
```

#### 1. **Cache API (Principal)**
- **Ubicación**: `caches.default` de Cloudflare
- **Persistencia**: Entre diferentes workers
- **Ventajas**: 
  - ✅ Funciona globalmente en todo el edge
  - ✅ Mantiene contadores entre requests
  - ✅ No se resetea con cada worker nuevo
- **Keys utilizadas**:
  - Rate Limiting: `https://ratelimit.internal/{tipo}/{ip}/{ventana}`
  - Timing Attack: `https://timing.internal/{ip}/{ventana}`

#### 2. **Maps en Memoria (Fallback)**
- **Ubicación**: Variables JavaScript en el worker
- **Persistencia**: Solo dentro del mismo worker
- **Ventajas**:
  - ✅ Ultra-rápido (no hay I/O)
  - ✅ Backup si Cache API falla
  - ✅ Protección básica garantizada
- **Maps utilizadas**:
  ```javascript
  rateLimitMap          // Contador de requests por IP
  timingTrackingMap     // Timestamps de requests
  velocityAttackMap     // Detección de ráfagas
  htmlLoadTrackingMap   // Orden de carga de recursos
  ```

---

## 🛡️ Las 19 Capas de Seguridad

### **FASE 1: Filtrado Inicial y Bypasses**

#### CAPA 0: Detección de Bots Verificados
```javascript
const allowedBots = [
  'googlebot', 'bingbot', 'facebookexternalhit',
  'twitterbot', 'linkedinbot', 'pinterestbot'
];
```
- **Qué hace**: Identifica bots legítimos de búsqueda y redes sociales
- **Por qué**: Estos bots tienen acceso VIP sin restricciones para SEO
- **Cuándo se aplica**: Primera línea, antes de cualquier validación
- **Personalizable**: Sí - agregar/quitar bots según necesidad

#### CAPA 6: Validación de Método HTTP
```javascript
if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
  return 405; // Method Not Allowed
}
```
- **Qué hace**: Solo permite métodos de lectura
- **Por qué**: Bloquea POST/PUT/DELETE no autorizados
- **Cuándo se aplica**: Después de bypasses, antes de todo
- **Impacto**: Sitios estáticos no necesitan POST/PUT/DELETE

---

### **FASE 2: Protección contra Ataques Básicos**

#### CAPA 15: Mini-WAF (Web Application Firewall)
```javascript
const maliciousPaths = [
  '/.env', '/.git', '/.aws', '/wp-admin', 
  '/wp-login', '/xmlrpc.php', '/config.json'
];

const maliciousQueries = [
  '<script>', 'UNION SELECT', 'CONCAT(', 
  'base64_decode', 'etc/passwd', 'alert(', 'eval('
];
```
- **Qué hace**: Bloquea rutas y queries maliciosos conocidos
- **Por qué**: Previene:
  - 🚫 Exposición de archivos sensibles (.env, .git)
  - 🚫 Ataques a WordPress (wp-admin, xmlrpc.php)
  - 🚫 SQL Injection (UNION SELECT, CONCAT)
  - 🚫 XSS (script tags, eval)
- **Cuándo se aplica**: Temprano en el pipeline
- **Personalizable**: Sí - agregar patrones específicos de tu stack

**Ejemplo de uso**:
```javascript
// Agregar protección para Laravel
maliciousPaths.push('/.env.backup', '/storage/logs');

// Agregar protección para Node.js
maliciousPaths.push('/node_modules', '/package.json');
```

#### CAPA 18: Bloqueo de ASN (Datacenters)
```javascript
const blockedAsnOrgs = [
  'amazon',           // AWS
  'microsoft corporation', // Azure
  'digitalocean', 
  'oracle',
  'hetzner',
  'ovh',
  'linode',
  'vultr',
  'tor exit'
];
```
- **Qué hace**: Bloquea tráfico desde hosting providers y TOR
- **Por qué**: 
  - 🚫 Scrapers profesionales usan AWS/Azure
  - 🚫 Ataques automatizados desde VPS
  - 🚫 TOR usado para anonimato malicioso
- **Excepción**: Bots verificados (Google, Bing) pasan aunque vengan de Google Cloud
- **Cuándo se aplica**: Después de Mini-WAF
- **Personalizable**: Sí - agregar/quitar ASNs según necesidad

**Ejemplo - Permitir Cloudflare Workers**:
```javascript
// Si tienes APIs en Cloudflare Workers que necesitan acceder:
if (!isSearchBot && !isCloudflareWorker && blockedAsnOrgs.some(...)) {
  return 403;
}
```

---

### **FASE 3: Detección de Ataques de Velocidad**

#### CAPA 16: Velocity Attack Detection
```javascript
const VELOCITY_CONFIG = {
  requests: 25,    // Máximo de requests
  window: 10000    // En 10 segundos
};
```
- **Qué hace**: Detecta ráfagas de requests desde una IP
- **Cómo funciona**:
  1. Guarda timestamp de cada request por IP
  2. Filtra timestamps antiguos (>10 segundos)
  3. Cuenta requests en ventana actual
  4. Bloquea si excede 25 requests/10s
- **Por qué**: 
  - 🛡️ Protege contra DDoS de baja escala
  - 🛡️ Detecta scrapers agresivos
  - 🛡️ Frena ataques de fuerza bruta
- **Cuándo se aplica**: Antes de Geo Challenge
- **Personalizable**: Sí - ajustar `requests` y `window`

**Ejemplo - Sitio con muchas imágenes**:
```javascript
const VELOCITY_CONFIG = {
  requests: 50,    // Más requests permitidos
  window: 10000    // Mantener ventana
};
```

---

### **FASE 4: Geo-Targeting y JS Challenge**

#### CAPA 10: Geo/IP Challenge
```javascript
const allowedCountries = ['UY', 'BR']; // Sin challenge
const challengeDuration = 300; // 5 minutos
```
- **Qué hace**: Desafía con JavaScript a usuarios fuera de países permitidos
- **Cómo funciona**:
  ```
  Usuario de España (ES):
  1. No está en ['UY', 'BR']
  2. No tiene cookie cf_js_clearance
  3. Ve página de JS Challenge
  4. JavaScript resuelve: challenge * 2
  5. Cookie se setea por 5 minutos
  6. Puede navegar por 5 minutos
  7. Cookie expira → Challenge de nuevo
  ```
- **Por qué**:
  - ✅ Clientes locales (UY/BR) sin fricción
  - 🚫 Scrapers simples (curl, wget) no pueden resolver JS
  - ⏰ Atacantes deben resolverlo cada 5 minutos
- **Cuándo se aplica**: Después de Velocity Attack
- **Personalizable**: Sí - países y duración

**Configuración según tipo de negocio**:
```javascript
// E-commerce internacional (todos pasan)
const allowedCountries = ['*']; // Desactivar geo-challenge

// Servicio local (muy restrictivo)
const allowedCountries = ['UY']; // Solo Uruguay
const challengeDuration = 180;   // 3 minutos

// Sitio regional (moderado)
const allowedCountries = ['AR', 'UY', 'BR', 'CL'];
const challengeDuration = 3600; // 1 hora
```

---

### **FASE 5: Protección contra Cache Poisoning**

#### CAPA 13: Cache Poisoning Protection
```javascript
const validHosts = [
  'calefonesuruguay.uy', 
  'www.calefonesuruguay.uy'
];

// Validaciones:
1. Host header debe estar en validHosts o *.pages.dev
2. X-Forwarded-Host debe coincidir con Host
3. Headers peligrosos bloqueados:
   - X-Original-URL
   - X-Rewrite-URL  
   - X-Host
   - X-Forwarded-Scheme
```
- **Qué hace**: Previene manipulación de caché de Cloudflare
- **Por qué**: Atacantes pueden intentar:
  - 💀 Cachear contenido malicioso con Host fake
  - 💀 Servir contenido de un sitio a otro
  - 💀 Bypassear controles con headers custom
- **Cuándo se aplica**: Después de Geo Challenge
- **Personalizable**: Sí - agregar dominios válidos

**Setup para múltiples dominios**:
```javascript
const validHosts = [
  'midominio.com',
  'www.midominio.com',
  'subdomain.midominio.com',
  'dominio-alternativo.com'
];
```

---

### **FASE 6: Protección de Recursos (CSS, JS, Imágenes)**

#### CAPA 7: Validación de User-Agent
```javascript
if (!userAgent || userAgent.trim() === '' || userAgent.length < 5) {
  return 403; // Forbidden
}
```
- **Qué hace**: Requiere User-Agent válido para recursos
- **Por qué**: 
  - 🚫 Scrapers básicos no envían User-Agent
  - 🚫 Scripts curl/wget por defecto tienen UA corto
- **Solo aplica a**: `.js`, `.css`, `.png`, `.jpg`, `.svg`, `.webp`, `.gif`
- **No aplica a**: HTML (para permitir navegadores antiguos)

#### CAPA 3: Rate Limiting por Recurso
```javascript
const RATE_LIMITS = {
  js_css: 12,    // 12 archivos JS/CSS por minuto
  images: 30,    // 30 imágenes por minuto
  window: 60000  // Ventana de 1 minuto
};
```
- **Qué hace**: Limita descarga de recursos por IP
- **Cómo funciona** (Sistema Dual):
  ```javascript
  async function checkRateLimitWithCache(ip, resourceType) {
    try {
      // 1. Intentar Cache API (persiste entre workers)
      const cache = caches.default;
      const cacheKey = `https://ratelimit.internal/${resourceType}/${ip}/${timeWindow}`;
      
      let count = await cache.match(cacheKey);
      count++;
      
      if (count > limit) {
        return { allowed: false };
      }
      
      await cache.put(cacheKey, count);
      return { allowed: true };
      
    } catch (error) {
      // 2. Fallback a Maps en memoria
      return checkRateLimitMaps(ip, resourceType);
    }
  }
  ```
- **Por qué dos sistemas**:
  - ✅ **Cache API**: Persiste entre workers (global)
  - ✅ **Maps**: Backup ultra-rápido si cache falla
- **Cuándo se aplica**: Solo para recursos (no HTML)
- **Personalizable**: Sí - ajustar límites según sitio

**Configuración según tipo de sitio**:
```javascript
// Sitio con muchas imágenes (galería)
const RATE_LIMITS = {
  js_css: 20,
  images: 100,  // Más imágenes permitidas
  window: 60000
};

// Sitio minimalista (landing page)
const RATE_LIMITS = {
  js_css: 5,
  images: 10,
  window: 60000
};

// API REST (JSON responses)
const RATE_LIMITS = {
  api: 30,      // Agregar categoría nueva
  window: 60000
};
```

#### CAPA 4: Timing Attack Detection
```javascript
const TIMING_CONFIG = {
  threshold: 400,    // 400ms mínimo entre requests
  minRequests: 10,   // Mínimo 10 requests
  trackingWindow: 1000 // Ventana de 1 segundo
};
```
- **Qué hace**: Detecta bots por velocidad constante
- **Cómo funciona**:
  1. Guarda timestamp de cada request
  2. Calcula diferencia entre requests consecutivos
  3. Si 10+ requests con <400ms entre ellos → Bot
- **Por qué**:
  - 🤖 Humanos tienen timing irregular (100ms-2000ms)
  - 🤖 Bots tienen timing perfecto (150ms, 150ms, 150ms...)
- **Ejemplo de detección**:
  ```
  Humano:
  Request 1: 0ms
  Request 2: 523ms  ← Irregular
  Request 3: 1204ms ← Irregular
  Request 4: 289ms  ← Irregular
  → NO bloqueado
  
  Bot:
  Request 1: 0ms
  Request 2: 150ms  ← Constante
  Request 3: 300ms  ← Constante (150ms diff)
  Request 4: 450ms  ← Constante (150ms diff)
  ...
  Request 10: 1350ms
  → BLOQUEADO (10 requests con <400ms)
  ```
- **Cuándo se aplica**: Después de Rate Limiting
- **Personalizable**: Sí - ajustar threshold y minRequests

#### CAPA 9: Request Order Validation
```javascript
const ORDER_CONFIG = {
  htmlLoadWindow: 60000 // 60 segundos
};
```
- **Qué hace**: Verifica que HTML se cargue antes que recursos
- **Cómo funciona**:
  1. Usuario carga `index.html` → Timestamp guardado
  2. Usuario solicita `styles.css` → Verifica timestamp HTML
  3. Si HTML cargado hace <60s → Permitir
  4. Si no hay timestamp HTML → Bloquear
- **Por qué**:
  - 🚫 Scrapers acceden directamente a `/logo.png` sin HTML
  - ✅ Navegadores reales siempre cargan HTML primero
- **Excepción**: `Sec-Fetch-Site: same-origin` bypass (recursos del navegador)
- **Cuándo se aplica**: Para recursos, no HTML
- **Personalizable**: Sí - ajustar ventana de tiempo

**Ajuste para SPAs (Single Page Apps)**:
```javascript
const ORDER_CONFIG = {
  htmlLoadWindow: 300000 // 5 minutos (SPA carga HTML una vez)
};
```

---

### **FASE 7: Detección y Bloqueo de Bots**

#### CAPA 8: Bot Blocking (56+ Patrones)
```javascript
const blockedBots = [
  // CLI Tools
  'wget', 'curl', 'libwww-perl', 'http_request', 'httpie',
  
  // Scrapers
  'scrapy', 'beautifulsoup', 'mechanize', 'jsoup',
  
  // Headless Browsers
  'headlesschrome', 'chromeheadless', 'puppeteer', 
  'playwright', 'selenium', 'webdriver', 'chromedriver',
  
  // HTTP Libraries
  'python-requests', 'go-http-client', 'axios', 
  
  // SEO Bots maliciosos
  'ahrefsbot', 'semrushbot', 'mj12bot',
  
  // Testing Tools
  'apachebench', 'jmeter', 'k6'
];
```
- **Qué hace**: Bloquea User-Agents de herramientas automatizadas
- **Protección de bots legítimos**:
  ```javascript
  if (!isSearchBot) { // Solo bloquear si NO es Google/Bing/etc
    const isBadBot = blockedBots.some(bot => userAgent.toLowerCase().includes(bot));
    if (isBadBot) {
      return 403;
    }
  }
  ```
- **Por qué**:
  - ✅ Google/Bing usan headless → NO bloqueados (tienen bypass)
  - 🚫 Scrapers usan puppeteer → Bloqueados
- **Cuándo se aplica**: Después de Rate Limiting
- **Personalizable**: Sí - agregar/quitar patrones

**Agregar patrones personalizados**:
```javascript
// Bloquear bot específico de tu competencia
blockedBots.push('competitorbot', 'scraper-xyz');

// Bloquear versiones específicas
blockedBots.push('python-requests/2.25', 'axios/0.21');
```

---

### **FASE 8: Browser Fingerprinting**

#### CAPA 2: Browser Fingerprinting
```javascript
let browserScore = 0;
if (acceptLanguage) browserScore++;
if (acceptEncoding && acceptEncoding.includes('gzip')) browserScore++;
if (secFetchSite) browserScore += 2;
if (isSameOrigin) browserScore++;

// Si score < 2 y NO es bot verificado ni same-origin → Bloquear
if (browserScore < 2 && !isSearchBot && !isSameOrigin) {
  return 403;
}
```
- **Qué hace**: Puntúa legitimidad del navegador
- **Headers evaluados**:
  - `Accept-Language`: Navegadores envían idiomas preferidos
  - `Accept-Encoding`: Navegadores soportan gzip/deflate
  - `Sec-Fetch-Site`: Navegadores modernos envían este header
  - Same-origin: Recursos cargados por el navegador
- **Por qué**:
  - ✅ Navegadores reales tienen todos estos headers
  - 🚫 Scripts curl básicos no los envían
- **Cuándo se aplica**: En validación de referer
- **Personalizable**: Sí - ajustar peso de cada header

**Ajuste de scoring**:
```javascript
// Más estricto
if (browserScore < 3 && !isSearchBot && !isSameOrigin) {
  return 403;
}

// Más permisivo
if (browserScore < 1 && !isSearchBot && !isSameOrigin) {
  return 403;
}
```

---

### **FASE 9: Control de Referer**

#### CAPA 1: Referer Checking
```javascript
const hasValidReferer = [
  'calefonesuruguay.uy', 
  'www.calefonesuruguay.uy', 
  'localhost' // Para desarrollo
].some(domain => referer.includes(domain));

const isDirectNavigation = !referer && secFetchSite === 'none';

// Permitir si:
// 1. Tiene referer válido
// 2. Es same-origin (recursos del navegador)
// 3. Es bot verificado
// 4. Es navegación directa (usuario escribió URL)
if (hasValidReferer || isSameOrigin || isSearchBot || isDirectNavigation) {
  // Permitir
} else {
  // Bloquear hotlinking
  if (referer && !hasValidReferer) {
    return 403; // Referer externo
  }
}
```
- **Qué hace**: Controla origen de requests
- **Casos de uso**:
  ```
  ✅ PERMITIDO:
  - Usuario escribe calefonesuruguay.uy en la barra
  - Click desde calefonesuruguay.uy/otra-pagina
  - Recursos cargados por el navegador (same-origin)
  - Google Bot indexando
  
  🚫 BLOQUEADO:
  - Hotlinking: <img src="calefonesuruguay.uy/logo.png"> desde otro-sitio.com
  - Scraper con referer falso
  ```
- **Por qué**:
  - 💰 Ahorra ancho de banda (bloquea hotlinking)
  - 🚫 Previene scraping con referer spoofing
  - ✅ Permite acceso legítimo
- **Cuándo se aplica**: Final de validaciones de recursos
- **Personalizable**: Sí - agregar dominios válidos

**Setup para múltiples dominios**:
```javascript
const hasValidReferer = [
  'midominio.com',
  'www.midominio.com',
  'cdn.midominio.com', // CDN propio
  'app.midominio.com', // Subdominios
  'localhost',
  '127.0.0.1'
].some(domain => referer.includes(domain));
```

---

### **FASE 10: Post-Processing (Después de servir contenido)**

#### CAPA 19: MIME Type Forcing & Dangerous Type Blocking
```javascript
const DANGEROUS_MIME_TYPES = [
  'application/x-msdownload',     // .exe
  'application/x-sh',             // .sh
  'application/x-httpd-php',      // .php
  'application/x-executable',     // binarios
  // ... 18 tipos peligrosos
];

// 1. Bloquear MIME peligrosos
if (isDangerousMimeType(currentMimeType)) {
  return 403;
}

// 2. Forzar MIME correcto según extensión
const correctMimeType = getCorrectMimeType(url);
if (correctMimeType) {
  newHeaders.set('Content-Type', correctMimeType);
}
```
- **Qué hace**: 
  1. Bloquea archivos ejecutables/scripts
  2. Fuerza MIME type correcto para cada archivo
- **Por qué**:
  - 🚫 Previene ejecución de malware
  - 🚫 Bloquea scripts PHP/Shell accidentales
  - ✅ Asegura que .js se sirva como JavaScript, no como text/plain
- **Cuándo se aplica**: Después de `await next()`
- **MIME types mapeados**:
  ```javascript
  '.js'   → 'application/javascript; charset=utf-8'
  '.css'  → 'text/css; charset=utf-8'
  '.json' → 'application/json; charset=utf-8'
  '.png'  → 'image/png'
  '.jpg'  → 'image/jpeg'
  // ... 20+ extensiones
  ```
- **Personalizable**: Sí - agregar extensiones y MIME types

**Agregar soporte para nuevos formatos**:
```javascript
// Agregar soporte para archivos Rust WASM
MIME_TYPES['.wasm'] = 'application/wasm';

// Agregar soporte para archivos TypeScript
MIME_TYPES['.ts'] = 'application/typescript';

// Bloquear extensión específica
DANGEROUS_MIME_TYPES.push('application/x-custom-dangerous');
```

#### CAPA 5: Content Security Policy (CSP)
```javascript
if (contentType.includes('text/html')) {
  newHeaders.set('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    // ...
  );
}
```
- **Qué hace**: Define qué recursos puede cargar el navegador
- **Directivas implementadas**:
  - `default-src`: Regla por defecto
  - `script-src`: De dónde puede cargar JavaScript
  - `style-src`: De dónde puede cargar CSS
  - `img-src`: De dónde puede cargar imágenes
  - `connect-src`: A dónde puede hacer fetch/XHR
  - `frame-src`: Qué iframes puede cargar
  - `form-action`: A dónde pueden enviar formularios
- **Por qué**:
  - 🚫 Previene XSS (Cross-Site Scripting)
  - 🚫 Bloquea inyección de scripts maliciosos
  - 🚫 Previene clickjacking con iframes
- **Cuándo se aplica**: Solo en respuestas HTML
- **No aplica a**: CSS, JS, imágenes individuales
- **Personalizable**: Sí - **REQUIERE** ajuste según tu sitio

**Configuración básica (sitio estático)**:
```javascript
newHeaders.set('Content-Security-Policy', 
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self'; " +
  "img-src 'self' data: https:; " +
  "font-src 'self' data:; " +
  "frame-ancestors 'none';"
);
```

**Configuración con Google Analytics**:
```javascript
"script-src 'self' 'unsafe-inline' " +
  "https://www.googletagmanager.com " +
  "https://www.google-analytics.com; " +
"connect-src 'self' " +
  "https://www.google-analytics.com " +
  "https://analytics.google.com; "
```

**Configuración con CDNs**:
```javascript
"script-src 'self' " +
  "https://cdn.jsdelivr.net " +
  "https://unpkg.com; " +
"style-src 'self' " +
  "https://cdn.jsdelivr.net " +
  "https://fonts.googleapis.com; " +
"font-src 'self' " +
  "https://fonts.gstatic.com; "
```

#### CAPA 17: HSTS & Permissions-Policy
```javascript
// HSTS - Fuerza HTTPS por 2 años
newHeaders.set('Strict-Transport-Security', 
  'max-age=63072000; includeSubDomains; preload'
);

// Permissions-Policy - Deshabilita funciones peligrosas
newHeaders.set('Permissions-Policy', 
  "camera=(), microphone=(), geolocation=(), " +
  "accelerometer=(), autoplay=(), " +
  "clipboard-write=(), encrypted-media=()"
);
```
- **HSTS (HTTP Strict Transport Security)**:
  - Fuerza HTTPS por 2 años (63072000 segundos)
  - `includeSubDomains`: Aplica a todos los subdominios
  - `preload`: Puede agregarse a lista de preload de navegadores
- **Permissions-Policy**:
  - Deshabilita acceso a cámara, micrófono, geolocalización
  - Previene código malicioso que intente usarlos
- **Por qué**:
  - ✅ Previene downgrade attacks (HTTPS → HTTP)
  - 🚫 Bloquea acceso no autorizado a hardware
- **Cuándo se aplica**: En todas las respuestas
- **Personalizable**: Sí - según funcionalidades del sitio

**Sitio que usa geolocalización**:
```javascript
newHeaders.set('Permissions-Policy', 
  "geolocation=(self), " + // Permitir geolocalización en mismo origen
  "camera=(), microphone=(), " + // Bloquear cámara y micrófono
  "accelerometer=(), autoplay=()"
);
```

#### CAPA 11: Cache-Control Optimizado
```javascript
if (url.pathname.endsWith('.js')) {
  newHeaders.set('Cache-Control', 'public, max-age=7776000, immutable');
}
else if (url.pathname.endsWith('.css')) {
  newHeaders.set('Cache-Control', 'public, max-age=7776000, immutable');
}
else if (isImage) {
  newHeaders.set('Cache-Control', 'public, max-age=7776000, stale-while-revalidate=86400');
}
else if (isHTML) {
  newHeaders.set('Cache-Control', 'public, max-age=7776000, must-revalidate');
}
```
- **Qué hace**: Optimiza caché del navegador
- **Estrategias**:
  - **JS/CSS**: `immutable` - Nunca cambia, cache infinito
  - **Imágenes**: `stale-while-revalidate` - Sirve viejo mientras revalida
  - **HTML**: `must-revalidate` - Verifica validez antes de servir
- **`max-age=7776000`**: 90 días
- **Por qué**:
  - ⚡ Reduce requests al servidor
  - ⚡ Mejora velocidad de carga
  - 💰 Ahorra ancho de banda
- **Cuándo se aplica**: En todas las respuestas
- **Personalizable**: Sí - ajustar tiempos según tipo de contenido

**Configuración para sitio dinámico**:
```javascript
if (url.pathname.endsWith('.js')) {
  newHeaders.set('Cache-Control', 'public, max-age=86400'); // 1 día
}
else if (isHTML) {
  newHeaders.set('Cache-Control', 'no-cache, must-revalidate'); // Siempre revalidar
}
```

#### CAPA 12: Compression Headers
```javascript
const compressibleTypes = ['.js', '.css', '.html', '.svg', '.json', '.xml', '.txt'];
if (isCompressible) {
  newHeaders.set('Vary', 'Accept-Encoding');
}
```
- **Qué hace**: Indica que respuesta varía según encoding aceptado
- **Por qué**: Cloudflare comprime automáticamente si detecta `Vary: Accept-Encoding`
- **Resultado**: 
  - gzip/brotli para clientes que lo soportan
  - Sin comprimir para clientes antiguos
- **Cuándo se aplica**: En respuestas comprimibles
- **Personalizable**: Sí - agregar extensiones

#### CAPA 14: Cache API Control
```javascript
const shouldCache = 
  response.status === 200 &&
  request.method === 'GET' &&
  !isSearchBot &&
  (isProtectedResource || isHTML);

if (shouldCache) {
  context.waitUntil(
    cache.put(cacheKey, responseToCache)
  );
}
```
- **Qué hace**: Guarda respuestas en caché de Cloudflare
- **Condiciones para cachear**:
  - Status 200 (éxito)
  - Método GET
  - No es bot de búsqueda (bots obtienen contenido fresco)
  - Es recurso o HTML
- **Cache key**: URL limpia (sin utm_*, fbclid, etc.)
- **Por qué**:
  - ⚡ Edge cache extremadamente rápido
  - 💰 Reduce requests a origin
- **Cuándo se aplica**: Después de servir respuesta
- **Personalizable**: Sí - ajustar condiciones

---

## ⚙️ Configuración y Personalización

### Variables de Configuración Globales

```javascript
// === RATE LIMITING ===
const RATE_LIMITS = {
  js_css: 12,    // ← CAMBIAR: Archivos JS/CSS por minuto
  images: 30,    // ← CAMBIAR: Imágenes por minuto
  window: 60000  // ← CAMBIAR: Ventana en milisegundos
};

// === TIMING ATTACK ===
const TIMING_CONFIG = {
  threshold: 400,      // ← CAMBIAR: Milisegundos mínimos entre requests
  minRequests: 10,     // ← CAMBIAR: Requests para considerar ataque
  trackingWindow: 1000 // ← CAMBIAR: Ventana de análisis
};

// === VELOCITY ATTACK ===
const VELOCITY_CONFIG = {
  requests: 25,    // ← CAMBIAR: Máximo de requests
  window: 10000    // ← CAMBIAR: En milisegundos (10s)
};

// === REQUEST ORDER ===
const ORDER_CONFIG = {
  htmlLoadWindow: 60000 // ← CAMBIAR: Tiempo válido después de cargar HTML
};

// === GEO CHALLENGE ===
const allowedCountries = ['UY', 'BR']; // ← CAMBIAR: Países sin challenge
const challengeDuration = 300; // ← CAMBIAR: 5 minutos = 300 segundos

// === BOTS VERIFICADOS ===
const allowedBots = [
  'googlebot', 'bingbot', // ← AGREGAR: Más bots legítimos
  'facebookexternalhit'
];

// === DOMINIOS VÁLIDOS ===
const validHosts = [
  'tudominio.com',       // ← CAMBIAR: Tu dominio
  'www.tudominio.com'    // ← CAMBIAR: Con www
];

// === ASN BLOQUEADOS ===
const blockedAsnOrgs = [
  'amazon', 'digitalocean' // ← CAMBIAR: Agregar/quitar ASNs
];
```

---

## 📦 Instalación en Nuevos Proyectos

### Paso 1: Copiar el Archivo

```bash
# Copiar _middleware.js a carpeta functions/
cp _middleware.js tu-nuevo-proyecto/functions/_middleware.js
```

### Paso 2: Personalizar Configuración

Editar `functions/_middleware.js` y cambiar:

```javascript
// 1. TU DOMINIO
const validHosts = [
  'tunuevodominio.com',      // ← CAMBIAR AQUÍ
  'www.tunuevodominio.com'   // ← CAMBIAR AQUÍ
];

// 2. PAÍSES PERMITIDOS
const allowedCountries = ['UY', 'AR', 'BR']; // ← CAMBIAR SEGÚN TU MERCADO

// 3. DURACIÓN DEL CHALLENGE
const challengeDuration = 300; // ← CAMBIAR: 180 (3min), 300 (5min), 600 (10min)

// 4. REFERER VÁLIDOS
const hasValidReferer = [
  'tunuevodominio.com',      // ← CAMBIAR AQUÍ
  'www.tunuevodominio.com',  // ← CAMBIAR AQUÍ
  'localhost'
].some(domain => referer.includes(domain));
```

### Paso 3: Ajustar CSP (Content Security Policy)

**⚠️ IMPORTANTE**: CSP debe configurarse según los servicios externos que uses.

```javascript
// EJEMPLO: Sitio con Google Analytics + Font Awesome CDN
if (contentType.includes('text/html')) {
  newHeaders.set('Content-Security-Policy', 
    "default-src 'self'; " +
    
    // Scripts: Self + Google Analytics + CDN
    "script-src 'self' 'unsafe-inline' " +
      "https://www.googletagmanager.com " +
      "https://www.google-analytics.com " +
      "https://cdn.jsdelivr.net; " +
    
    // Estilos: Self + Font Awesome CDN
    "style-src 'self' 'unsafe-inline' " +
      "https://cdnjs.cloudflare.com; " +
    
    // Imágenes: Self + cualquier HTTPS
    "img-src 'self' data: https:; " +
    
    // Fuentes: Self + Google Fonts
    "font-src 'self' data: " +
      "https://fonts.gstatic.com " +
      "https://cdnjs.cloudflare.com; " +
    
    // Conexiones: Self + Google Analytics
    "connect-src 'self' " +
      "https://www.google-analytics.com; " +
    
    // No permitir iframes externos
    "frame-ancestors 'none';"
  );
}
```

### Paso 4: Probar en Local

```bash
# Instalar Wrangler (CLI de Cloudflare)
npm install -g wrangler

# Iniciar servidor de desarrollo
wrangler pages dev tu-nuevo-proyecto

# Probar en http://localhost:8788
```

### Paso 5: Desplegar

```bash
# Conectar con Cloudflare
wrangler login

# Desplegar
wrangler pages deploy tu-nuevo-proyecto
```

---

## 🔍 Monitoreo y Debugging

### Logs en Cloudflare Dashboard

El middleware genera logs detallados:

```javascript
// Ver en: Cloudflare Dashboard > Pages > Logs

// Geo Challenge
console.log('🔍 Geo Challenge - Country:', country, 'Cookies:', cookies);
console.log('✅ Geo Challenge pasado - Cookie válida para IP:', ip);

// Cache Poisoning
console.warn('⚠️ CACHE POISONING ATTEMPT: Invalid Host', {...});

// MIME Peligroso
console.warn('🚨 MIME peligroso bloqueado:', mimeType, 'desde IP:', ip);

// MIME Corrección
console.log('🔧 MIME corregido:', oldMime, '→', newMime, 'para', pathname);
```

### Headers de Debug

Cada respuesta incluye headers informativos:

```
X-Cache-Status: HIT/MISS
X-Cache-Key: /path/to/resource
X-Cache-Protection: active
X-Security-Layers: 19
X-Middleware-Version: v3.0-2025-11-09
X-Country: UY (solo en challenge)
X-Challenge-Type: JavaScript Challenge (Geo)
```

### Testing desde Terminal

```powershell
# Test 1: Verificar headers de seguridad
curl -I https://tudominio.com

# Test 2: Simular bot (debe bloquearse)
curl -A "curl/7.68" https://tudominio.com

# Test 3: Simular Googlebot (debe pasar)
curl -A "Googlebot/2.1" https://tudominio.com

# Test 4: Test de cache poisoning (debe bloquearse)
curl -H "X-Original-URL: /admin" https://tudominio.com

# Test 5: Rate limiting (hacer 30+ requests rápidos)
for ($i=0; $i -lt 30; $i++) { 
  curl https://tudominio.com/logo.png
}
```

---

## 🔧 Troubleshooting

### Problema 1: "Bucle infinito en JS Challenge"

**Síntoma**: Página de verificación se recarga constantemente

**Causas**:
1. Cookie no se está guardando
2. Validación de cookie incorrecta
3. Cache del navegador

**Solución**:
```javascript
// Verificar en consola del navegador:
document.cookie // Debe mostrar cf_js_clearance=verified_123

// Si no aparece:
// 1. Verificar que max-age no sea 0
// 2. Verificar que dominio sea correcto
// 3. Verificar que path sea /
```

### Problema 2: "Usuarios legítimos bloqueados"

**Síntoma**: Usuarios de Uruguay reportan 403

**Causas**:
1. VPN/Proxy detectado como datacenter
2. ASN bloqueado por error
3. User-Agent inusual

**Solución**:
```javascript
// 1. Verificar ASN del usuario
// En Cloudflare Logs buscar: request.cf.asOrganization

// 2. Agregar excepción temporal
if (ip === '123.456.789.012') { // IP del usuario
  return next(); // Bypass temporal
}

// 3. Permitir ASN específico
const allowedAsns = ['ISP-Usuario'];
if (allowedAsns.includes(asnOrg)) {
  return next();
}
```

### Problema 3: "Google no indexa el sitio"

**Síntoma**: Bajada en Google Search Console

**Causas**:
1. Googlebot bloqueado por error
2. Rate limiting muy agresivo
3. CSP bloqueando recursos

**Solución**:
```javascript
// Verificar que Googlebot esté en lista
const allowedBots = [
  'googlebot',              // ← DEBE ESTAR
  'googlebot-image',        // ← DEBE ESTAR
  'googlebot-video',        // ← DEBE ESTAR
  'google-inspectiontool'   // ← DEBE ESTAR
];

// Verificar que isSearchBot esté funcionando
console.log('Bot detectado:', isSearchBot, 'UA:', userAgent);

// Si sigue fallando, agregar bypass temporal
if (userAgent.toLowerCase().includes('google')) {
  return next();
}
```

### Problema 4: "Recursos no cargan (CSP)"

**Síntoma**: Errores en consola del navegador como "blocked by CSP"

**Causas**:
1. CSP muy restrictivo
2. Dominio de CDN no permitido
3. `'unsafe-inline'` faltante

**Solución**:
```javascript
// 1. Verificar error específico en consola
// "Refused to load script from 'https://cdn.example.com'"

// 2. Agregar dominio a script-src
"script-src 'self' 'unsafe-inline' " +
  "https://cdn.example.com; " + // ← AGREGAR AQUÍ

// 3. Para debugging temporal, hacer CSP permisivo
"default-src * 'unsafe-inline' 'unsafe-eval';" // ⚠️ Solo para debug

// 4. Después ir restringiendo dominio por dominio
```

### Problema 5: "Rate limiting muy agresivo"

**Síntoma**: Usuarios reales reciben 429 Too Many Requests

**Causas**:
1. Límites muy bajos
2. Sitio con muchos recursos
3. No considera imágenes lazy-load

**Solución**:
```javascript
// Opción 1: Aumentar límites
const RATE_LIMITS = {
  js_css: 20,  // Era 12 → Subir a 20
  images: 50,  // Era 30 → Subir a 50
  window: 60000
};

// Opción 2: Aumentar ventana de tiempo
const RATE_LIMITS = {
  js_css: 12,
  images: 30,
  window: 120000  // Era 60s → 2 minutos
};

// Opción 3: Deshabilitar para same-origin
if (!isSameOrigin) {
  // Solo aplicar rate limiting si NO es same-origin
  const rateLimitResult = await checkRateLimitWithCache(ip, resourceType);
}
```

---

## 📊 Comparación de Configuraciones por Tipo de Sitio

| Característica | E-commerce | Landing Page | Servicio Local | Blog |
|----------------|------------|--------------|----------------|------|
| **Geo Challenge** | ✅ Todos los países | ✅ Todos | 🔒 Solo país objetivo | ✅ Región |
| **Challenge Duration** | 1 hora | 30 min | 5 min | 2 horas |
| **Rate Limit JS/CSS** | 20/min | 10/min | 12/min | 15/min |
| **Rate Limit Images** | 50/min | 20/min | 30/min | 40/min |
| **ASN Blocking** | ❌ Deshabilitado | ✅ Habilitado | ✅ Habilitado | ⚠️ Selectivo |
| **Velocity Attack** | 50 req/10s | 20 req/10s | 25 req/10s | 30 req/10s |
| **Bot Blocking** | ⚠️ Moderado | ✅ Agresivo | ✅ Agresivo | ⚠️ Moderado |
| **Referer Check** | ⚠️ Permisivo | ✅ Estricto | ✅ Estricto | ⚠️ Permisivo |

---

## 🎓 Preguntas Frecuentes

### ¿Este middleware funciona en Cloudflare Workers?

**Sí**, con modificaciones menores. Cambiar:
- `export async function onRequest(context)` → `export default { async fetch(request, env, ctx) }`
- `context.next()` → `fetch(request)` a tu origin

### ¿Puedo usar esto con Next.js en Cloudflare Pages?

**Sí**, el middleware se ejecuta **antes** del SSR de Next.js. Toda la protección aplica.

### ¿Afecta el SEO?

**No**, bots verificados (Google, Bing, etc.) tienen bypass total. No ven challenges ni rate limiting.

### ¿Funciona con APIs?

**Parcialmente**. El middleware está optimizado para sitios web. Para APIs:
1. Deshabilitar validación de referer
2. Ajustar rate limiting por endpoint
3. Cambiar respuestas de 403/429 a JSON

### ¿Puedo desactivar capas específicas?

**Sí**, comentar las secciones no deseadas:
```javascript
// Desactivar Bot Blocking (CAPA 8)
/*
const blockedBots = [...];
if (!isSearchBot) {
  const isBadBot = blockedBots.some(...);
  if (isBadBot) return 403;
}
*/
```

### ¿Cómo sé si está funcionando?

1. **Ver headers**: `curl -I https://tudominio.com` debe mostrar `X-Security-Layers: 19`
2. **Probar con curl**: `curl https://tudominio.com` debe dar 403
3. **Revisar logs**: Cloudflare Dashboard > Pages > Logs

---

## 📄 Licencia y Contribuciones

Este middleware es de código abierto. Puedes:
- ✅ Usar en proyectos comerciales
- ✅ Modificar según necesidades
- ✅ Compartir con otros desarrolladores
- ✅ Contribuir mejoras vía Pull Request

**Autor**: Jorguitouy
**Repositorio**: https://github.com/Jorguitouy/calefonesuruguay.uy
**Versión**: v3.0-2025-11-09

---

## 🚀 Próximos Pasos

1. ✅ Instalar en tu proyecto
2. ✅ Personalizar configuración
3. ✅ Probar en desarrollo local
4. ✅ Desplegar a producción
5. ✅ Monitorear logs
6. ✅ Ajustar según necesidades

**¿Tienes dudas?** Abre un issue en GitHub o revisa los logs de Cloudflare para debugging detallado.

---

**Última actualización**: 9 de noviembre de 2025
