# ⚙️ Configuración del Panel de Cloudflare - Reglas y Cache Warming

## 📋 Tabla de Contenidos

1. [Reglas de Firewall (WAF)](#-reglas-de-firewall-waf)
2. [Page Rules](#-page-rules)
3. [Transform Rules](#-transform-rules)
4. [Cache Rules](#-cache-rules)
5. [Configuration Rules](#-configuration-rules)
6. [Rate Limiting Rules](#-rate-limiting-rules)
7. [Sistema de Cache Warming](#-sistema-de-cache-warming)
8. [SSL/TLS Settings](#-ssltls-settings)
9. [DNS Configuration](#-dns-configuration)
10. [Verificación y Testing](#-verificación-y-testing)

---

## 🔥 Reglas de Firewall (WAF)

### Ubicación
`Security` → `WAF` → `Custom rules`

### Reglas Implementadas

#### Regla 1: Bloqueo de Bots Maliciosos (Adicional al Middleware)
```
Nombre: Block Aggressive Bots
Campo: User Agent
Operador: contains
Valores:
  - "python-requests"
  - "Go-http-client"
  - "Java/"
  - "Apache-HttpClient"
Acción: Block
```

**Por qué**: Complementa el middleware bloqueando en el edge antes de llegar a Pages Functions.

---

#### Regla 2: Protección contra Scanners de Vulnerabilidades
```
Nombre: Block Security Scanners
Campo: User Agent
Operador: contains
Valores:
  - "Nmap"
  - "Nikto"
  - "sqlmap"
  - "Acunetix"
  - "Nessus"
  - "OpenVAS"
Acción: Block
```

**Por qué**: Bloquea herramientas de escaneo de vulnerabilidades.

---

#### Regla 3: Challenge para Países Específicos (Backup del Middleware)
```
Nombre: Geo Challenge Backup
Campo: Country
Operador: not in list
Lista: Uruguay (UY), Brazil (BR)
Excepciones:
  - Known Bots: Yes
  - Verified Bots: Yes
Acción: Managed Challenge (JS + Captcha fallback)
```

**Por qué**: Doble capa de geo-blocking. Si el middleware falla, Cloudflare WAF actúa como backup.

---

#### Regla 4: Bloqueo de ASN Sospechosos (Adicional)
```
Nombre: Block Suspicious ASN
Campo: AS Num
Operador: in list
Valores:
  - 14061 (DigitalOcean)
  - 16509 (Amazon AWS)
  - 8075 (Microsoft Azure)
  - 16276 (OVH)
  - 63949 (Linode)
Excepciones:
  - Known Bots: Yes
  - User Agent contains: Googlebot, Bingbot
Acción: Block
```

**Por qué**: Bloquea datacenters conocidos. Excepciona bots legítimos que usan infraestructura cloud.

---

#### Regla 5: Rate Limiting en WAF (Backup del Middleware)
```
Nombre: Rate Limit Global
Campo: All incoming requests
Threshold: 100 requests per 10 seconds per IP
Acción: Block for 60 seconds
Excepciones:
  - Known Bots: Yes
```

**Por qué**: Protección adicional contra DDoS. El middleware tiene límites más granulares, esto es para ataques masivos.

---

## 📄 Page Rules

### Ubicación
`Rules` → `Page Rules`

### Reglas Implementadas

#### Page Rule 1: Cache Everything HTML
```
URL Pattern: calefonesuruguay.uy/*
Settings:
  - Cache Level: Cache Everything
  - Edge Cache TTL: 2 hours
  - Browser Cache TTL: 1 hour
  - Origin Cache Control: On
```

**Por qué**: Cachea agresivamente todo el contenido HTML y assets para máxima velocidad.

---

#### Page Rule 2: Bypass Cache para Desarrollo
```
URL Pattern: *localhost* o *.pages.dev/*
Settings:
  - Cache Level: Bypass
```

**Por qué**: No cachear durante desarrollo para ver cambios inmediatos.

---

## 🔄 Transform Rules

### Ubicación
`Rules` → `Transform Rules`

### HTTP Request Header Modification

#### Transform Rule 1: Agregar Header de Seguridad
```
Nombre: Add Security Headers
Cuando: All incoming requests
Acción: Set dynamic header
Header: X-Security-Source
Valor: Cloudflare-WAF
```

**Por qué**: Indica al middleware que el request pasó por WAF de Cloudflare.

---

#### Transform Rule 2: Limpiar Headers Peligrosos
```
Nombre: Remove Dangerous Headers
Cuando: All incoming requests
Acción: Remove headers
Headers:
  - X-Original-URL
  - X-Rewrite-URL
  - X-Forwarded-Proto
  - X-Forwarded-Scheme
```

**Por qué**: Previene cache poisoning y header injection antes de llegar al middleware.

---

## 💾 Cache Rules

### Ubicación
`Caching` → `Cache Rules`

### Reglas Implementadas

#### Cache Rule 1: Assets Estáticos - Cache Largo
```
Nombre: Cache Static Assets Long
Cuando: URI Path matches regex
Pattern: \.(js|css|png|jpg|jpeg|svg|webp|gif|woff2?|ttf|otf|eot)$
Entonces:
  - Eligible for cache: Yes
  - Edge Cache TTL: 7 days (604800 seconds)
  - Browser Cache TTL: 7 days
  - Cache by device type: No
  - Cache by query string: Ignore query string
  - Origin Cache Control: Off (override origin)
```

**Por qué**: Assets estáticos no cambian frecuentemente. Cache largo maximiza hits.

---

#### Cache Rule 2: HTML - Cache Corto con Revalidación
```
Nombre: Cache HTML Short
Cuando: Content-Type equals "text/html" OR URI Path matches regex \.html?$
Entonces:
  - Eligible for cache: Yes
  - Edge Cache TTL: 2 hours (7200 seconds)
  - Browser Cache TTL: 1 hour (3600 seconds)
  - Cache by device type: No
  - Serve stale content: While revalidate
  - Origin Cache Control: Respect
```

**Por qué**: HTML puede cambiar. Cache corto con revalidación para balance entre velocidad y frescura.

---

#### Cache Rule 3: API/Endpoints Dinámicos - No Cache
```
Nombre: Bypass Dynamic Content
Cuando: URI Path starts with /api/ OR URI Path contains ?
Entonces:
  - Eligible for cache: No
  - Browser Cache TTL: No cache
```

**Por qué**: Contenido dinámico o con query strings no debe cachearse.

---

#### Cache Rule 4: Cache de Imágenes con Compresión
```
Nombre: Cache Images with Compression
Cuando: URI Path matches regex \.(png|jpg|jpeg|webp|gif)$
Entonces:
  - Eligible for cache: Yes
  - Edge Cache TTL: 30 days (2592000 seconds)
  - Browser Cache TTL: 7 days
  - Serve stale content: If error (24 hours)
  - Polish: Lossless
  - Format: Auto (WebP/AVIF)
```

**Por qué**: Imágenes se comprimen y sirven en formatos modernos. Cache muy largo porque raramente cambian.

---

## ⚙️ Configuration Rules

### Ubicación
`Rules` → `Configuration Rules`

### Reglas Implementadas

#### Config Rule 1: Habilitar Polish y Mirage
```
Nombre: Optimize Images
Cuando: Content-Type starts with "image/"
Configuración:
  - Polish: Lossless
  - Mirage: On (lazy loading del lado del servidor)
```

**Por qué**: Optimización automática de imágenes sin modificar código.

---

#### Config Rule 2: Auto Minify
```
Nombre: Minify Assets
Cuando: All requests
Configuración:
  - Auto Minify: JavaScript, CSS, HTML
```

**Por qué**: Reduce tamaño de transferencia sin cambiar funcionalidad.

---

#### Config Rule 3: Brotli Compression
```
Nombre: Enable Brotli
Cuando: All requests
Configuración:
  - Compression: Brotli + Gzip
```

**Por qué**: Brotli tiene mejor ratio de compresión que gzip (~20% más).

---

## 🚦 Rate Limiting Rules

### Ubicación
`Security` → `Rate Limiting Rules`

### Reglas Implementadas

#### Rate Limit 1: Protección HTML
```
Nombre: Protect HTML Pages
Cuando: URI Path ends with .html OR URI Path equals /
Threshold: 30 requests per 10 seconds per IP
Período: 10 seconds
Acción: Block for 60 seconds
Excepciones:
  - Known Bots: Yes
```

---

#### Rate Limit 2: Protección de Assets
```
Nombre: Protect Static Assets
Cuando: URI Path matches regex \.(js|css|png|jpg)$
Threshold: 50 requests per 10 seconds per IP
Período: 10 seconds
Acción: Challenge (Managed)
Excepciones:
  - Known Bots: Yes
```

---

## 🔥 Sistema de Cache Warming

### Problema Original
El cache de Cloudflare se "enfría" (expira) después de cierto tiempo sin requests, causando:
- Primera visita lenta (cache miss)
- Carga en el servidor origin
- Experiencia inconsistente para usuarios

### Solución Implementada: Cache Warmer Automático

#### Arquitectura del Sistema

```
┌─────────────────────────────────────────────┐
│   Cloudflare Workers Cron Job (Trigger)    │
│   Ejecuta cada 30 minutos                    │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│   Cache Warmer Worker (Ejecutor)           │
│   - Lee sitemap.xml                         │
│   - Extrae URLs                             │
│   - Genera requests                         │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│   Pages Function (_middleware.js)          │
│   - Detecta User-Agent: CacheWarmer/1.0    │
│   - Bypass todas las protecciones          │
│   - Sirve contenido normalmente            │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│   Cloudflare Cache                          │
│   - Cache se mantiene caliente             │
│   - Usuarios siempre cache hit             │
└─────────────────────────────────────────────┘
```

---

### Paso 1: Crear Worker de Cache Warming

#### Código del Worker: `cache-warmer.js`

```javascript
// Worker de Cache Warming para Cloudflare Pages
// Mantiene el cache caliente visitando URLs cada 30 minutos

export default {
  async scheduled(event, env, ctx) {
    await warmCache(env);
  },

  async fetch(request, env) {
    // Endpoint manual para testing
    if (request.url.endsWith('/warm-now')) {
      await warmCache(env);
      return new Response('Cache warming completado', { status: 200 });
    }
    
    return new Response('Cache Warmer Worker', { status: 200 });
  }
};

async function warmCache(env) {
  const siteUrl = 'https://calefonesuruguay.uy'; // ← CAMBIAR a tu dominio
  const sitemapUrl = `${siteUrl}/sitemap.xml`;
  
  console.log(`🔥 Iniciando cache warming para ${siteUrl}`);
  
  try {
    // 1. Obtener sitemap.xml
    const sitemapResponse = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'CacheWarmer/1.0 (Cloudflare-Worker)'
      }
    });
    
    if (!sitemapResponse.ok) {
      console.error(`❌ Error al obtener sitemap: ${sitemapResponse.status}`);
      return;
    }
    
    const sitemapText = await sitemapResponse.text();
    
    // 2. Extraer URLs del sitemap
    const urlMatches = sitemapText.matchAll(/<loc>(.*?)<\/loc>/g);
    const urls = [];
    
    for (const match of urlMatches) {
      urls.push(match[1]);
    }
    
    console.log(`📋 Encontradas ${urls.length} URLs para calentar`);
    
    // 3. Visitar cada URL (máximo 100 para no exceder límites)
    const urlsToWarm = urls.slice(0, 100);
    let successCount = 0;
    let errorCount = 0;
    
    // Procesar en lotes de 10 URLs simultáneas
    const batchSize = 10;
    for (let i = 0; i < urlsToWarm.length; i += batchSize) {
      const batch = urlsToWarm.slice(i, i + batchSize);
      
      const promises = batch.map(async (url) => {
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'CacheWarmer/1.0 (Cloudflare-Worker)',
              'Cache-Control': 'no-cache', // Forzar fetch desde origin
              'Pragma': 'no-cache'
            },
            cf: {
              cacheTtl: 7200, // Cache por 2 horas
              cacheEverything: true
            }
          });
          
          if (response.ok) {
            successCount++;
            console.log(`✅ Warmed: ${url} (${response.status})`);
          } else {
            errorCount++;
            console.warn(`⚠️ Error: ${url} (${response.status})`);
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Failed: ${url}`, error.message);
        }
      });
      
      await Promise.all(promises);
      
      // Delay entre lotes para no sobrecargar
      if (i + batchSize < urlsToWarm.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 segundo
      }
    }
    
    console.log(`🏁 Cache warming completado: ${successCount} éxitos, ${errorCount} errores`);
    
  } catch (error) {
    console.error('❌ Error en cache warming:', error);
  }
}
```

---

### Paso 2: Desplegar el Worker

#### Opción A: Usando Wrangler CLI

```bash
# 1. Instalar Wrangler
npm install -g wrangler

# 2. Crear proyecto
mkdir cache-warmer
cd cache-warmer

# 3. Crear wrangler.toml
cat > wrangler.toml << 'EOF'
name = "cache-warmer"
main = "cache-warmer.js"
compatibility_date = "2025-11-10"

# Cron trigger: cada 30 minutos
[triggers]
crons = ["*/30 * * * *"]

# Variables
[vars]
SITE_URL = "https://calefonesuruguay.uy"
EOF

# 4. Copiar el código cache-warmer.js (del paso anterior)

# 5. Desplegar
wrangler login
wrangler deploy
```

---

#### Opción B: Usando Dashboard de Cloudflare

1. Ve a **Workers & Pages** → **Create application**
2. Selecciona **Create Worker**
3. Nombre: `cache-warmer`
4. Copia y pega el código de `cache-warmer.js`
5. Click en **Deploy**

**Configurar Cron Trigger**:
1. Ve a tu Worker → **Triggers** tab
2. Click en **Add Cron Trigger**
3. Schedule: `*/30 * * * *` (cada 30 minutos)
4. Click en **Add trigger**

---

### Paso 3: Bypass en el Middleware

El bypass ya está implementado en `_middleware.js` (líneas 360-365):

```javascript
// === BYPASS PARA CACHE WARMING BOT ===
if (userAgent.includes('CacheWarmer/1.0') || 
    url.pathname.startsWith('/api/warm')) {
  return next();
}
```

**Qué hace**:
- Detecta User-Agent `CacheWarmer/1.0`
- Bypass completo de todas las 19 capas
- Permite que el worker caliente el cache sin restricciones

---

### Paso 4: Verificar que Funciona

#### Test Manual del Worker

```powershell
# 1. Obtener URL del worker
# Ejemplo: https://cache-warmer.tu-cuenta.workers.dev

# 2. Trigger manual
curl https://cache-warmer.tu-cuenta.workers.dev/warm-now

# Debe responder: "Cache warming completado"
```

#### Verificar Logs del Worker

1. Ve a **Workers & Pages** → `cache-warmer` → **Logs**
2. Debes ver:
   ```
   🔥 Iniciando cache warming para https://calefonesuruguay.uy
   📋 Encontradas 50 URLs para calentar
   ✅ Warmed: https://calefonesuruguay.uy/index.html (200)
   ✅ Warmed: https://calefonesuruguay.uy/productos.html (200)
   ...
   🏁 Cache warming completado: 50 éxitos, 0 errores
   ```

#### Verificar Cache Hit Rate

1. Ve a **Analytics** → Tu sitio
2. Observa **Cache Hit Rate**
3. Debe estar en **85-95%** (antes del cache warming: 60-70%)

---

### Paso 5: Optimizaciones Avanzadas

#### Calentar Solo URLs Importantes

```javascript
// En cache-warmer.js, agregar filtro:
const importantUrls = urls.filter(url => {
  // Calentar solo páginas de productos y servicios
  return url.includes('/productos/') || 
         url.includes('/servicios/') ||
         url.endsWith('.html');
});
```

#### Calentar Diferentes Dispositivos

```javascript
// Simular mobile y desktop
const devices = [
  { name: 'Desktop', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  { name: 'Mobile', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)' }
];

for (const device of devices) {
  await fetch(url, {
    headers: {
      'User-Agent': `CacheWarmer/1.0 (${device.name}); ${device.ua}`
    }
  });
}
```

#### Horarios Inteligentes

```javascript
// Calentar más frecuentemente en horarios pico
// En wrangler.toml:
[triggers]
crons = [
  "0 8-20 * * *",  # Cada hora de 8am a 8pm (horario laboral)
  "*/30 0-7,21-23 * * *"  # Cada 30 min resto del día
]
```

---

## 🔒 SSL/TLS Settings

### Ubicación
`SSL/TLS` → `Overview`

### Configuración Implementada

```
SSL/TLS encryption mode: Full (strict)

Edge Certificates:
  ✅ Always Use HTTPS
  ✅ Automatic HTTPS Rewrites
  ✅ Minimum TLS Version: TLS 1.2
  ✅ Opportunistic Encryption
  ✅ TLS 1.3: Enabled
  ✅ HTTP Strict Transport Security (HSTS): Enabled
      - Max Age: 6 months (15768000 seconds)
      - Include subdomains: Yes
      - Preload: Yes
```

**Por qué**: Máxima seguridad en transporte. TLS 1.3 para mejor performance.

---

## 🌐 DNS Configuration

### Ubicación
`DNS` → `Records`

### Configuración Implementada

```
Type: CNAME
Name: @
Content: calefonesuruguay-uy.pages.dev
Proxy status: Proxied (orange cloud)
TTL: Auto

Type: CNAME
Name: www
Content: calefonesuruguay-uy.pages.dev
Proxy status: Proxied (orange cloud)
TTL: Auto
```

**Por qué**: Orange cloud activa todas las protecciones de Cloudflare (cache, DDoS, etc.).

---

## ✅ Verificación y Testing

### Checklist de Configuración Completa

#### Firewall Rules
```powershell
# Test: Verificar bloqueo de bot
curl -A "python-requests/2.28" https://calefonesuruguay.uy
# Esperado: 403 Forbidden o Challenge
```

#### Cache Rules
```powershell
# Test: Verificar cache de assets
curl -I https://calefonesuruguay.uy/logo.png
# Debe mostrar: cf-cache-status: HIT (segunda vez)
```

#### Cache Warming
```powershell
# Test: Verificar que worker funciona
curl https://cache-warmer.tu-cuenta.workers.dev/warm-now
# Esperado: "Cache warming completado"

# Verificar cache hit rate en Analytics
# Esperado: >85%
```

#### SSL/TLS
```powershell
# Test: Verificar TLS 1.3
curl -I --tlsv1.3 https://calefonesuruguay.uy
# Esperado: HTTP/2 200 (TLS 1.3)
```

---

## 📊 Métricas Esperadas

### Antes de Configuraciones

| Métrica | Valor |
|---------|-------|
| Cache Hit Rate | 60-70% |
| Average Response Time | 150-300ms |
| Bandwidth Usage | 100% |
| Blocked Requests | ~5% |

### Después de Configuraciones

| Métrica | Valor | Mejora |
|---------|-------|--------|
| Cache Hit Rate | **85-95%** | +25% |
| Average Response Time | **50-100ms** | -66% |
| Bandwidth Usage | **50-60%** | -40% |
| Blocked Requests | **35-50%** | +30% |

---

## 🔄 Mantenimiento

### Revisión Mensual

- [ ] Verificar logs del cache warmer (errores?)
- [ ] Revisar cache hit rate (>85%?)
- [ ] Actualizar sitemap.xml si hay nuevas páginas
- [ ] Verificar firewall rules (falsos positivos?)
- [ ] Revisar analytics (patrones de ataque?)

### Actualización de Reglas

Cuando agregues nuevas páginas:

1. Actualizar `sitemap.xml`
2. El cache warmer las detectará automáticamente
3. Verificar que se están calentando en logs

---

## 🆘 Troubleshooting

### Problema: Cache Hit Rate Bajo

**Causas**:
- Cache warmer no ejecutándose
- Cron trigger deshabilitado
- URLs no en sitemap.xml

**Solución**:
```powershell
# 1. Verificar cron trigger en Worker
# Dashboard → Workers → cache-warmer → Triggers

# 2. Ejecutar manualmente
curl https://cache-warmer.tu-cuenta.workers.dev/warm-now

# 3. Verificar logs
# Dashboard → Workers → cache-warmer → Logs
```

---

### Problema: Worker Excede CPU Time

**Causas**:
- Demasiadas URLs en sitemap (>500)
- Lotes muy grandes

**Solución**:
```javascript
// Limitar a 100 URLs más importantes
const urlsToWarm = urls
  .filter(url => url.includes('/productos/'))
  .slice(0, 100);
```

---

### Problema: Firewall Bloqueando Usuarios Legítimos

**Causas**:
- Rate limiting muy agresivo
- Geo-blocking demasiado estricto

**Solución**:
```
1. Revisar logs: Security → Events
2. Identificar patrón de false positive
3. Agregar excepción en regla de firewall
4. O ajustar threshold de rate limiting
```

---

## 📝 Resumen de Configuraciones

### En Cloudflare Dashboard

| Sección | Configuración | Objetivo |
|---------|--------------|----------|
| **WAF** | 5 custom rules | Bloqueo adicional de bots y ASNs |
| **Page Rules** | 2 rules | Cache everything + bypass dev |
| **Cache Rules** | 4 rules | Estrategias por tipo de contenido |
| **Config Rules** | 3 rules | Polish, Minify, Brotli |
| **Rate Limiting** | 2 rules | Protección HTML y assets |
| **SSL/TLS** | Full Strict + HSTS | Seguridad máxima |
| **DNS** | CNAME proxied | Activar protecciones |

### En Cloudflare Workers

| Worker | Propósito | Schedule |
|--------|-----------|----------|
| **cache-warmer** | Mantener cache caliente | Cada 30 min |

### En Código (_middleware.js)

| Bypass | User-Agent | Razón |
|--------|------------|-------|
| Cache Warmer | `CacheWarmer/1.0` | Permitir warming sin restricciones |
| Bots Legítimos | `Googlebot`, `Bingbot`, etc. | SEO y redes sociales |

---

## 🎯 Resultado Final

Con todas estas configuraciones implementadas:

✅ **Seguridad**: 19 capas middleware + 5 reglas WAF + rate limiting  
✅ **Performance**: Cache hit >90% gracias a cache warming  
✅ **Disponibilidad**: Stale-while-revalidate mantiene sitio accesible  
✅ **SEO**: Bots legítimos con acceso VIP  
✅ **Experiencia**: <100ms response time para usuarios  

---

**Última actualización**: 10 de noviembre de 2025  
**Versión**: v1.0
