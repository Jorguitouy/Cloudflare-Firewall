# 🔥 Sistema de Cache Warming - Documentación Completa

## 📋 Índice

1. [¿Qué es Cache Warming?](#-qué-es-cache-warming)
2. [Problema que Resuelve](#-problema-que-resuelve)
3. [Arquitectura del Sistema](#-arquitectura-del-sistema)
4. [Implementación Paso a Paso](#-implementación-paso-a-paso)
5. [Código Completo Explicado](#-código-completo-explicado)
6. [Configuración Avanzada](#-configuración-avanzada)
7. [Monitoreo y Métricas](#-monitoreo-y-métricas)
8. [Troubleshooting](#-troubleshooting)
9. [Optimizaciones](#-optimizaciones)
10. [Costos y Límites](#-costos-y-límites)

---

## 🤔 ¿Qué es Cache Warming?

**Cache Warming** (calentar la caché) es una técnica que consiste en **visitar proactivamente** las páginas de tu sitio web de forma automatizada para mantener el contenido en la caché de Cloudflare antes de que lleguen usuarios reales.

### Analogía del Mundo Real

Imagina una cafetería:

```
❌ SIN Cache Warming:
Cliente llega → Barista prepara café desde cero → 5 minutos de espera

✅ CON Cache Warming:
Robot prepara cafés cada 30 min → Café siempre listo → Cliente recibe en 10 segundos
```

En nuestro caso:
- **Robot** = Cloudflare Worker con cron job
- **Café** = Contenido HTML/CSS/JS cacheado
- **Cliente** = Usuario real visitando tu sitio

---

## 💡 Problema que Resuelve

### El Problema del "Cache Frío"

Cloudflare cachea contenido con un **TTL (Time To Live)**. Cuando el TTL expira o no hay tráfico, el cache se "enfría":

```
1. Usuario visita página por primera vez
   ↓
2. Cloudflare: "No tengo esto en cache" (MISS)
   ↓
3. Cloudflare hace request al servidor origin
   ↓
4. Servidor genera respuesta (200-500ms)
   ↓
5. Cloudflare cachea respuesta
   ↓
6. Usuario recibe contenido (LENTO)

Próximas visitas:
7. Usuario visita misma página
   ↓
8. Cloudflare: "Lo tengo en cache!" (HIT)
   ↓
9. Usuario recibe contenido (RÁPIDO - 10-50ms)
```

**Problema**: El **primer usuario** siempre sufre la latencia del origin. Si hay poco tráfico, el cache expira constantemente.

### Síntomas de Cache Frío

- ❌ **Cache Hit Rate bajo**: 50-70% (debería ser >90%)
- ❌ **Response times inconsistentes**: Algunos usuarios 50ms, otros 300ms
- ❌ **Carga innecesaria en origin**: Servidor trabaja más de lo necesario
- ❌ **Mala experiencia para usuarios madrugadores**: Primer visitante del día espera más

### La Solución: Cache Warming Automático

```
┌────────────────────────────────────────────────┐
│  Cloudflare Worker (Cache Warmer Bot)         │
│  Ejecuta cada 30 minutos automáticamente      │
└───────────────┬────────────────────────────────┘
                │
                ▼
    Visita TODAS las páginas importantes
    (Lee sitemap.xml automáticamente)
                │
                ▼
┌────────────────────────────────────────────────┐
│  Cache de Cloudflare                           │
│  Siempre tiene contenido fresco (TTL renovado) │
└────────────────────────────────────────────────┘
                │
                ▼
    👤 Usuario llega → Cache HIT instantáneo (10-50ms)
```

---

## 🏗️ Arquitectura del Sistema

### Componentes del Sistema

```
┌─────────────────────────────────────────────────────┐
│ 1. CRON TRIGGER (Cloudflare Scheduler)             │
│    Ejecuta cada: */30 * * * * (30 minutos)         │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ Trigger Event
                   ▼
┌─────────────────────────────────────────────────────┐
│ 2. CACHE WARMER WORKER                             │
│    - Fetch sitemap.xml                             │
│    - Parse XML y extraer <loc> URLs                │
│    - Filtrar URLs importantes                      │
│    - Procesar en lotes de 10                       │
│    - User-Agent: CacheWarmer/1.0                   │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ HTTP Requests
                   ▼
┌─────────────────────────────────────────────────────┐
│ 3. CLOUDFLARE EDGE (Proxy)                         │
│    - Recibe request del worker                     │
│    - Pasa por WAF/Firewall rules                   │
│    - Detecta User-Agent especial                   │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ Proxied Request
                   ▼
┌─────────────────────────────────────────────────────┐
│ 4. PAGES FUNCTION (_middleware.js)                 │
│    - Detecta: userAgent.includes('CacheWarmer')    │
│    - BYPASS todas las 19 capas de seguridad        │
│    - return next() sin restricciones               │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ Unprotected Request
                   ▼
┌─────────────────────────────────────────────────────┐
│ 5. CLOUDFLARE PAGES (Origin)                       │
│    - Genera respuesta HTML/CSS/JS                  │
│    - Headers: Cache-Control, etc.                  │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ Response con Cache Headers
                   ▼
┌─────────────────────────────────────────────────────┐
│ 6. CLOUDFLARE CACHE                                │
│    - Guarda respuesta con TTL                      │
│    - Status: MISS → HIT para próximos usuarios     │
│    - TTL renovado cada 30 minutos por el worker    │
└─────────────────────────────────────────────────────┘
```

### Flujo de Datos Detallado

```javascript
// Cada 30 minutos:

// Paso 1: Cron trigger ejecuta
scheduled(event) → warmCache()

// Paso 2: Worker obtiene sitemap
fetch('https://tudominio.com/sitemap.xml')
  → Parse XML
  → Extract URLs: ['/', '/productos.html', '/servicios.html', ...]

// Paso 3: Worker visita cada URL
for each url in urls:
  fetch(url, { 
    headers: { 'User-Agent': 'CacheWarmer/1.0' },
    cf: { cacheTtl: 7200, cacheEverything: true }
  })
  
// Paso 4: Middleware detecta y bypassa
if (userAgent.includes('CacheWarmer/1.0')) {
  return next(); // Sin rate limiting, sin geo-challenge, sin nada
}

// Paso 5: Cache se calienta
Cache status: MISS (primera vez)
Cache status: HIT (próximas 2 horas)

// Paso 6: Usuario real llega
User request → Cloudflare Edge
  → Cache HIT (10-50ms)
  → Usuario feliz ✅
```

---

## 🚀 Implementación Paso a Paso

### Paso 1: Crear el Worker

#### 1.1. Crear archivo `cache-warmer.js`

```javascript
/**
 * Cache Warmer Worker para Cloudflare Pages
 * 
 * Propósito: Mantener el cache de Cloudflare caliente visitando
 * automáticamente todas las URLs del sitemap.xml cada 30 minutos.
 * 
 * Arquitectura:
 * - Cron trigger ejecuta scheduled() cada 30 minutos
 * - Lee sitemap.xml del dominio configurado
 * - Extrae URLs con regex /<loc>(.*?)<\/loc>/
 * - Procesa en lotes de 10 URLs simultáneas
 * - User-Agent especial: CacheWarmer/1.0
 * - Middleware detecta y bypassa todas las protecciones
 * - Cache se mantiene caliente (TTL renovado constantemente)
 * 
 * Autor: Jorguitouy
 * Versión: 1.0
 * Fecha: 10 Nov 2025
 */

export default {
  /**
   * Handler de cron trigger (ejecutado por Cloudflare Scheduler)
   * @param {ScheduledEvent} event - Evento del cron
   * @param {Object} env - Variables de entorno
   * @param {ExecutionContext} ctx - Contexto de ejecución
   */
  async scheduled(event, env, ctx) {
    console.log('🕐 Cron trigger ejecutado:', new Date().toISOString());
    await warmCache(env);
  },

  /**
   * Handler de fetch (para testing manual y health checks)
   * @param {Request} request - Request HTTP
   * @param {Object} env - Variables de entorno
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Endpoint para trigger manual (testing)
    if (url.pathname === '/warm-now') {
      console.log('🔥 Warming manual iniciado por:', request.headers.get('CF-Connecting-IP'));
      await warmCache(env);
      return new Response('✅ Cache warming completado exitosamente', { 
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    
    // Endpoint de health check
    if (url.pathname === '/health') {
      return new Response('✅ Cache Warmer Worker: Online', { 
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    
    // Endpoint de status/info
    if (url.pathname === '/') {
      const info = {
        name: 'Cache Warmer Worker',
        version: '1.0',
        status: 'running',
        siteUrl: env.SITE_URL || 'Not configured',
        endpoints: {
          warmNow: '/warm-now',
          health: '/health',
          info: '/'
        }
      };
      
      return new Response(JSON.stringify(info, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('404 Not Found', { status: 404 });
  }
};

/**
 * Función principal de cache warming
 * @param {Object} env - Variables de entorno del worker
 */
async function warmCache(env) {
  const startTime = Date.now();
  
  // Obtener URL del sitio desde variable de entorno
  const siteUrl = env.SITE_URL || 'https://calefonesuruguay.uy';
  const sitemapUrl = `${siteUrl}/sitemap.xml`;
  
  console.log(`🔥 ============================================`);
  console.log(`🔥 Iniciando cache warming para: ${siteUrl}`);
  console.log(`🔥 Sitemap URL: ${sitemapUrl}`);
  console.log(`🔥 Timestamp: ${new Date().toISOString()}`);
  console.log(`🔥 ============================================`);
  
  try {
    // PASO 1: Obtener sitemap.xml
    console.log('📥 Paso 1: Descargando sitemap.xml...');
    
    const sitemapResponse = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'CacheWarmer/1.0 (Cloudflare-Worker; +https://github.com/Jorguitouy/Cloudflare-Firewall)',
        'Accept': 'application/xml, text/xml, */*'
      }
    });
    
    if (!sitemapResponse.ok) {
      console.error(`❌ Error al obtener sitemap: ${sitemapResponse.status} ${sitemapResponse.statusText}`);
      return;
    }
    
    const sitemapText = await sitemapResponse.text();
    console.log(`✅ Sitemap descargado: ${sitemapText.length} bytes`);
    
    // PASO 2: Extraer URLs del sitemap
    console.log('📋 Paso 2: Extrayendo URLs del sitemap...');
    
    const urlMatches = sitemapText.matchAll(/<loc>(.*?)<\/loc>/g);
    const allUrls = [];
    
    for (const match of urlMatches) {
      allUrls.push(match[1].trim());
    }
    
    console.log(`✅ URLs encontradas: ${allUrls.length}`);
    
    if (allUrls.length === 0) {
      console.warn('⚠️ No se encontraron URLs en el sitemap');
      return;
    }
    
    // PASO 3: Filtrar y limitar URLs (opcional)
    // Limitar a 100 URLs para no exceder límites de CPU/tiempo
    const maxUrls = env.MAX_URLS || 100;
    const urlsToWarm = allUrls.slice(0, maxUrls);
    
    console.log(`📊 URLs a procesar: ${urlsToWarm.length} (máximo: ${maxUrls})`);
    
    // PASO 4: Visitar cada URL en lotes
    console.log('🚀 Paso 3: Iniciando requests de warming...');
    
    let successCount = 0;
    let errorCount = 0;
    const batchSize = env.BATCH_SIZE || 10; // Procesar 10 URLs a la vez
    
    for (let i = 0; i < urlsToWarm.length; i += batchSize) {
      const batch = urlsToWarm.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(urlsToWarm.length / batchSize);
      
      console.log(`📦 Procesando lote ${batchNumber}/${totalBatches} (${batch.length} URLs)...`);
      
      // Procesar lote en paralelo
      const promises = batch.map(async (url) => {
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'CacheWarmer/1.0 (Cloudflare-Worker; +https://github.com/Jorguitouy/Cloudflare-Firewall)',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'es-UY,es;q=0.9,en;q=0.8',
              'Accept-Encoding': 'gzip, deflate, br',
              'Cache-Control': 'no-cache', // Forzar fetch desde origin
              'Pragma': 'no-cache'
            },
            // Opciones de cache de Cloudflare
            cf: {
              cacheTtl: 7200, // Cache por 2 horas
              cacheEverything: true // Cachear todo, incluso con cookies/query strings
            }
          });
          
          if (response.ok) {
            successCount++;
            console.log(`  ✅ ${response.status} | ${url}`);
          } else {
            errorCount++;
            console.warn(`  ⚠️ ${response.status} | ${url}`);
          }
          
        } catch (error) {
          errorCount++;
          console.error(`  ❌ ERROR | ${url} | ${error.message}`);
        }
      });
      
      // Esperar a que termine el lote
      await Promise.all(promises);
      
      // Delay entre lotes para no sobrecargar (1 segundo)
      if (i + batchSize < urlsToWarm.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // PASO 5: Resumen final
    const duration = Date.now() - startTime;
    const durationSeconds = (duration / 1000).toFixed(2);
    
    console.log(`🏁 ============================================`);
    console.log(`🏁 Cache warming completado`);
    console.log(`🏁 ============================================`);
    console.log(`📊 Estadísticas:`);
    console.log(`   - URLs procesadas: ${urlsToWarm.length}`);
    console.log(`   - Éxitos: ${successCount} (${((successCount/urlsToWarm.length)*100).toFixed(1)}%)`);
    console.log(`   - Errores: ${errorCount} (${((errorCount/urlsToWarm.length)*100).toFixed(1)}%)`);
    console.log(`   - Duración: ${durationSeconds}s`);
    console.log(`   - Velocidad: ${(urlsToWarm.length / (duration / 1000)).toFixed(1)} URLs/segundo`);
    console.log(`🏁 ============================================`);
    
  } catch (error) {
    console.error('❌ ============================================');
    console.error('❌ Error crítico en cache warming:');
    console.error('❌', error.message);
    console.error('❌', error.stack);
    console.error('❌ ============================================');
  }
}
```

---

#### 1.2. Crear archivo `wrangler.toml`

```toml
# Configuración del Worker de Cache Warming
name = "cache-warmer"
main = "cache-warmer.js"
compatibility_date = "2025-11-10"

# Cron Triggers: Ejecutar cada 30 minutos
# Sintaxis: minuto hora día mes día-semana
# */30 * * * * = Cada 30 minutos, todos los días
[triggers]
crons = ["*/30 * * * *"]

# Variables de entorno
[vars]
SITE_URL = "https://calefonesuruguay.uy"  # ← CAMBIAR a tu dominio
MAX_URLS = "100"                          # Máximo de URLs a procesar
BATCH_SIZE = "10"                         # URLs por lote (paralelismo)

# Límites de recursos
# [limits]
# cpu_ms = 30000  # 30 segundos máximo de CPU
```

**Explicación de Cron Syntax**:

```
┌───────────── minuto (0-59)
│ ┌─────────── hora (0-23)
│ │ ┌───────── día del mes (1-31)
│ │ │ ┌─────── mes (1-12)
│ │ │ │ ┌───── día de la semana (0-7, 0 y 7 son domingo)
│ │ │ │ │
* * * * *
```

**Ejemplos comunes**:

```toml
# Cada 15 minutos
crons = ["*/15 * * * *"]

# Cada hora en punto
crons = ["0 * * * *"]

# Cada 2 horas
crons = ["0 */2 * * *"]

# Cada hora entre 8am y 8pm (horario laboral)
crons = ["0 8-20 * * *"]

# Dos horarios diferentes: cada 15 min de 8am-8pm, cada hora resto del día
crons = ["*/15 8-20 * * *", "0 0-7,21-23 * * *"]

# Solo días laborales (lunes a viernes) cada 30 minutos
crons = ["*/30 * * * 1-5"]
```

---

### Paso 2: Desplegar el Worker

#### Opción A: Usando Wrangler CLI (Recomendado)

```powershell
# 1. Instalar Wrangler (solo primera vez)
npm install -g wrangler

# 2. Login en Cloudflare
wrangler login

# 3. Crear directorio del proyecto
mkdir cache-warmer
cd cache-warmer

# 4. Copiar archivos
# Crear cache-warmer.js con el código del Paso 1.1
# Crear wrangler.toml con la config del Paso 1.2

# 5. Desplegar
wrangler deploy

# Salida esperada:
# ✅ Deployment complete!
# 🌍 https://cache-warmer.tu-cuenta.workers.dev
```

---

#### Opción B: Usando Dashboard de Cloudflare

**Paso 2.1: Crear Worker**

1. Ve a **Workers & Pages** → **Create application**
2. Click en **Create Worker**
3. Nombre: `cache-warmer`
4. Click en **Deploy**

**Paso 2.2: Agregar Código**

1. En la página del worker, click en **Quick edit**
2. **Borrar** todo el código de ejemplo
3. **Copiar y pegar** el código completo de `cache-warmer.js` (Paso 1.1)
4. Click en **Save and Deploy**

**Paso 2.3: Configurar Variables de Entorno**

1. Ve a **Settings** → **Variables**
2. Click en **Add variable**
3. Agregar:
   ```
   Name: SITE_URL
   Value: https://tudominio.com
   
   Name: MAX_URLS
   Value: 100
   
   Name: BATCH_SIZE
   Value: 10
   ```
4. Click en **Save**

**Paso 2.4: Configurar Cron Trigger**

1. Ve a **Triggers** tab
2. En la sección **Cron Triggers**, click en **Add Cron Trigger**
3. Schedule: `*/30 * * * *` (cada 30 minutos)
4. Click en **Add trigger**

---

### Paso 3: Configurar Bypass en Middleware

El bypass **ya está implementado** en `_middleware.js` (líneas 360-365):

```javascript
// === BYPASS PARA CACHE WARMING BOT ===
if (userAgent.includes('CacheWarmer/1.0') || 
    url.pathname.startsWith('/api/warm')) {
  return next();
}
```

**Qué hace**:
- Detecta User-Agent que contiene `CacheWarmer/1.0`
- Ejecuta `return next()` inmediatamente
- **Bypassa las 19 capas**:
  - ❌ Sin rate limiting
  - ❌ Sin geo-challenge
  - ❌ Sin bot blocking
  - ❌ Sin timing attack detection
  - ❌ Sin referer checking
  - ❌ Sin velocity attack detection
  - ✅ Acceso directo al contenido

**Verificar que está implementado**:

```powershell
# Buscar el bypass en tu middleware
Select-String -Path "functions\_middleware.js" -Pattern "CacheWarmer"

# Debe mostrar la línea con el bypass
```

---

### Paso 4: Verificar que Funciona

#### 4.1. Test Manual Inmediato

```powershell
# Obtener URL del worker (aparece después del deploy)
# Ejemplo: https://cache-warmer.tu-cuenta.workers.dev

# Test 1: Health check
curl https://cache-warmer.tu-cuenta.workers.dev/health
# Esperado: ✅ Cache Warmer Worker: Online

# Test 2: Información del worker
curl https://cache-warmer.tu-cuenta.workers.dev/
# Esperado: JSON con info del worker

# Test 3: Trigger manual de warming
curl https://cache-warmer.tu-cuenta.workers.dev/warm-now
# Esperado: ✅ Cache warming completado exitosamente
```

#### 4.2. Verificar Logs del Worker

**Dashboard**:
1. Ve a **Workers & Pages** → `cache-warmer`
2. Click en **Logs** tab (o **Logs** en el menú lateral)
3. Debes ver logs como:

```
🔥 ============================================
🔥 Iniciando cache warming para: https://tudominio.com
🔥 Sitemap URL: https://tudominio.com/sitemap.xml
📥 Paso 1: Descargando sitemap.xml...
✅ Sitemap descargado: 15234 bytes
📋 Paso 2: Extrayendo URLs del sitemap...
✅ URLs encontradas: 50
📦 Procesando lote 1/5 (10 URLs)...
  ✅ 200 | https://tudominio.com/
  ✅ 200 | https://tudominio.com/productos.html
  ✅ 200 | https://tudominio.com/servicios.html
  ...
🏁 Cache warming completado
📊 Estadísticas:
   - URLs procesadas: 50
   - Éxitos: 50 (100.0%)
   - Errores: 0 (0.0%)
   - Duración: 12.45s
```

#### 4.3. Verificar Cache Hit Rate

**Analytics Dashboard**:
1. Ve a tu sitio en **Pages** o **Websites**
2. Click en **Analytics** tab
3. Ve a **Traffic** → **Cache**
4. Observa **Cache Hit Rate**

**Métricas esperadas**:

| Tiempo | Cache Hit Rate |
|--------|----------------|
| Antes del cache warming | 60-70% |
| 1 hora después | 75-85% |
| 24 horas después | **85-95%** |

#### 4.4. Verificar que Worker se Ejecuta Automáticamente

**Cron Logs**:
1. Ve a **Workers & Pages** → `cache-warmer` → **Logs**
2. Espera 30 minutos (siguiente ejecución del cron)
3. Debes ver nuevos logs automáticamente

**Verificar timestamp**:
```
🕐 Cron trigger ejecutado: 2025-11-10T14:30:00.000Z
🔥 Iniciando cache warming para: ...
```

---

## 📊 Monitoreo y Métricas

### Métricas Clave a Observar

#### 1. Cache Hit Rate

**Ubicación**: Analytics → Traffic → Cache

```
Objetivo: >90%

Interpretación:
- 50-70%: ❌ Cache frío, necesita warming
- 70-85%: ⚠️ Mejorando, esperar 24h
- 85-95%: ✅ Óptimo, cache caliente
- >95%: 🏆 Excelente
```

**Verificar con curl**:

```powershell
# Primera request: MISS
curl -I https://tudominio.com
# cf-cache-status: MISS

# Segunda request (inmediata): HIT
curl -I https://tudominio.com
# cf-cache-status: HIT

# Si ambas son HIT: Cache warming funcionando ✅
```

#### 2. Origin Requests

**Ubicación**: Analytics → Traffic → Origin

```
Objetivo: <20% del total de requests

Interpretación:
- >50%: ❌ Cache no funciona bien
- 20-50%: ⚠️ Cache warming parcial
- 10-20%: ✅ Bien
- <10%: 🏆 Excelente (solo warming y nuevo contenido)
```

#### 3. Response Time (TTFB)

**Ubicación**: Analytics → Performance → Time to First Byte

```
Objetivo: <100ms promedio

Interpretación:
- >300ms: ❌ Cache frío o sin cache
- 100-300ms: ⚠️ Mix de HIT y MISS
- 50-100ms: ✅ Cache mayormente caliente
- <50ms: 🏆 Cache 100% caliente
```

#### 4. Worker Execution Time

**Ubicación**: Workers & Pages → cache-warmer → Metrics

```
Objetivo: <30 segundos por ejecución

Interpretación:
- >60s: ❌ Demasiadas URLs o timeout
- 30-60s: ⚠️ Mucho trabajo, considerar optimizar
- 10-30s: ✅ Normal para 50-100 URLs
- <10s: 🏆 Pocas URLs o muy eficiente
```

### Dashboard de Monitoreo

Crear un dashboard simple en Grafana o Cloudflare Analytics:

```
┌──────────────────────────────────────┐
│  Cache Warming Dashboard             │
├──────────────────────────────────────┤
│                                      │
│  📊 Cache Hit Rate: 92%  ✅          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                      │
│  ⏱️ Avg Response Time: 45ms ✅       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                      │
│  🔄 Last Warming: 5 min ago ✅       │
│  Next Warming: in 25 min            │
│                                      │
│  📈 URLs Warmed: 50/50 (100%) ✅     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                      │
│  ⚡ Origin Requests: 15% ✅          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                      │
└──────────────────────────────────────┘
```

---

## 🔧 Troubleshooting

### Problema 1: Cache Hit Rate No Mejora

**Síntomas**:
- Cache hit rate sigue en 60-70% después de 24h
- Logs del worker muestran ejecuciones exitosas

**Diagnóstico**:

```powershell
# 1. Verificar que worker se ejecuta
# Logs deben mostrar ejecuciones cada 30 min

# 2. Verificar que URLs se están visitando
# Logs deben mostrar: ✅ 200 | https://...

# 3. Test manual de una URL específica
curl -I https://tudominio.com/productos.html
# Primera vez: cf-cache-status: MISS
# Segunda vez (inmediata): cf-cache-status: HIT
# Si segunda vez también MISS: problema en cache rules
```

**Soluciones**:

1. **Verificar Cache Rules en Dashboard**:
   ```
   Caching → Cache Rules
   - Debe haber regla para cachear HTML/assets
   - TTL debe ser >30 minutos
   ```

2. **Verificar Headers de Origen**:
   ```powershell
   curl -I https://tudominio.com
   # Buscar: Cache-Control header
   # Debe ser: public, max-age=... (no no-cache)
   ```

3. **Aumentar frecuencia de warming**:
   ```toml
   # En wrangler.toml
   crons = ["*/15 * * * *"]  # Cada 15 min en vez de 30
   ```

---

### Problema 2: Worker Timeout o Errores

**Síntomas**:
- Logs muestran errores
- Worker no completa ejecución
- Error: "CPU time limit exceeded"

**Diagnóstico**:

```javascript
// En logs buscar:
❌ ERROR | https://... | Timeout
// O
❌ Error crítico en cache warming: CPU time limit exceeded
```

**Soluciones**:

1. **Reducir número de URLs**:
   ```toml
   # En wrangler.toml
   MAX_URLS = "50"  # En vez de 100
   ```

2. **Reducir tamaño de lotes**:
   ```toml
   BATCH_SIZE = "5"  # En vez de 10
   ```

3. **Filtrar solo URLs importantes**:
   ```javascript
   // En cache-warmer.js, después de extraer URLs:
   const urlsToWarm = allUrls.filter(url => {
     // Solo páginas principales
     return url.endsWith('.html') || 
            url.endsWith('/') ||
            url.includes('/productos/');
   }).slice(0, 50);
   ```

---

### Problema 3: Sitemap No Se Encuentra

**Síntomas**:
- Logs muestran: `❌ Error al obtener sitemap: 404`
- Worker no encuentra sitemap.xml

**Diagnóstico**:

```powershell
# Verificar que sitemap existe y es accesible
curl https://tudominio.com/sitemap.xml
# Debe devolver XML, no 404
```

**Soluciones**:

1. **Crear sitemap.xml**:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
     <url>
       <loc>https://tudominio.com/</loc>
       <lastmod>2025-11-10</lastmod>
       <changefreq>weekly</changefreq>
       <priority>1.0</priority>
     </url>
     <url>
       <loc>https://tudominio.com/productos.html</loc>
       <lastmod>2025-11-10</lastmod>
       <changefreq>monthly</changefreq>
       <priority>0.8</priority>
     </url>
     <!-- ... más URLs ... -->
   </urlset>
   ```

2. **Usar lista hardcodeada como fallback**:
   ```javascript
   // En cache-warmer.js, agregar:
   const fallbackUrls = [
     `${siteUrl}/`,
     `${siteUrl}/productos.html`,
     `${siteUrl}/servicios.html`,
     `${siteUrl}/contacto.html`
   ];
   
   // Si sitemap falla:
   if (!sitemapResponse.ok) {
     console.warn('⚠️ Sitemap no disponible, usando fallback URLs');
     urlsToWarm = fallbackUrls;
   }
   ```

---

### Problema 4: Worker Bloqueado por Middleware

**Síntomas**:
- Logs muestran: `⚠️ 403 | https://...` o `⚠️ 429 | https://...`
- Worker recibe Forbidden o Too Many Requests

**Diagnóstico**:

```javascript
// Logs muestran errores HTTP:
⚠️ 403 | https://tudominio.com/productos.html
⚠️ 429 | https://tudominio.com/servicios.html
```

**Soluciones**:

1. **Verificar bypass en middleware**:
   ```javascript
   // En _middleware.js, DEBE estar cerca del inicio:
   if (userAgent.includes('CacheWarmer/1.0') || 
       url.pathname.startsWith('/api/warm')) {
     return next(); // SIN restricciones
   }
   ```

2. **Verificar User-Agent del worker**:
   ```javascript
   // En cache-warmer.js, verificar:
   headers: {
     'User-Agent': 'CacheWarmer/1.0 ...'  // DEBE contener CacheWarmer/1.0
   }
   ```

3. **Agregar IP del worker a whitelist** (temporal):
   ```javascript
   // En _middleware.js:
   const workerIP = request.headers.get('CF-Connecting-IP');
   const whitelistedIPs = ['1.2.3.4']; // IP de Cloudflare Workers
   if (whitelistedIPs.includes(workerIP)) {
     return next();
   }
   ```

---

## 🚀 Optimizaciones

### Optimización 1: Warming Inteligente por Prioridad

Calentar primero las páginas más importantes:

```javascript
// En cache-warmer.js, después de extraer URLs:

// Definir prioridades (más bajo = más importante)
const priorities = {
  '/': 1,                          // Home más importante
  '/productos': 2,                 // Productos segundo
  '/servicios': 2,
  '/contacto': 3,
  default: 4
};

// Función para obtener prioridad
function getPriority(url) {
  for (const [path, priority] of Object.entries(priorities)) {
    if (url.includes(path)) return priority;
  }
  return priorities.default;
}

// Ordenar URLs por prioridad
const sortedUrls = allUrls.sort((a, b) => {
  return getPriority(a) - getPriority(b);
});

// Calentar primero las importantes
const urlsToWarm = sortedUrls.slice(0, 100);
```

---

### Optimización 2: Warming por Dispositivo

Calentar cache para mobile y desktop:

```javascript
// En cache-warmer.js:

const devices = [
  { 
    name: 'Desktop', 
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
  },
  { 
    name: 'Mobile', 
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/537.36' 
  }
];

// En el loop de warming:
for (const url of urlsToWarm) {
  for (const device of devices) {
    await fetch(url, {
      headers: {
        'User-Agent': `CacheWarmer/1.0 (${device.name}); ${device.ua}`,
        // ... otros headers
      }
    });
  }
}
```

---

### Optimización 3: Warming en Horarios Pico

Ejecutar más frecuentemente durante horario laboral:

```toml
# En wrangler.toml:
[triggers]
crons = [
  "*/15 8-20 * * *",      # Cada 15 min de 8am a 8pm
  "0 */2 0-7,21-23 * * *" # Cada 2 horas resto del día
]
```

**Explicación**:
- **8am-8pm**: Horario con más tráfico → warm cada 15 minutos
- **9pm-7am**: Bajo tráfico → warm cada 2 horas (ahorra recursos)

---

### Optimización 4: Cache Warming Predictivo

Calentar URLs basándose en analytics:

```javascript
// Integrar con Cloudflare Analytics API
async function getTopUrls(env) {
  const analyticsUrl = `https://api.cloudflare.com/client/v4/zones/${env.ZONE_ID}/analytics/...`;
  
  const response = await fetch(analyticsUrl, {
    headers: {
      'Authorization': `Bearer ${env.CF_API_TOKEN}`
    }
  });
  
  const data = await response.json();
  
  // Retornar top 50 URLs más visitadas
  return data.result.topUrls.slice(0, 50);
}

// En warmCache():
const topUrls = await getTopUrls(env);
const urlsToWarm = topUrls; // Calentar solo lo más visitado
```

---

## 💰 Costos y Límites

### Cloudflare Workers Free Plan

```
✅ Incluido GRATIS:
- 100,000 requests/día
- 10ms CPU time por request
- Unlimited cron triggers

Límites:
- Máximo 30 cron triggers por worker
- Máximo 30 segundos de CPU time por invocación
```

### Cálculo de Uso

**Ejemplo**: 50 URLs, warming cada 30 min

```
Requests por día:
- 48 ejecuciones/día (cada 30 min)
- 50 URLs por ejecución
- Total: 48 × 50 = 2,400 requests/día

✅ MUY por debajo del límite de 100,000/día
```

**Costo adicional**: $0 (gratis)

### Workers Paid Plan ($5/mes)

```
Si necesitas más:
- 10,000,000 requests/mes incluidos
- 50ms CPU time por request
- Sin límites de cron triggers

Ideal para:
- Warming cada 5-10 minutos
- Sitios con 500+ URLs
- Múltiples sitios (1 worker por sitio)
```

---

## 📝 Checklist de Implementación

### Pre-requisitos

- [ ] Sitio en Cloudflare Pages funcionando
- [ ] `_middleware.js` implementado
- [ ] `sitemap.xml` generado y accesible
- [ ] Cuenta de Cloudflare (free o paid)

### Implementación

- [ ] Crear archivo `cache-warmer.js` con código completo
- [ ] Crear archivo `wrangler.toml` con configuración
- [ ] Modificar `SITE_URL` en wrangler.toml
- [ ] Desplegar worker (wrangler o dashboard)
- [ ] Configurar cron trigger (*/30 * * * *)
- [ ] Verificar bypass en `_middleware.js`

### Testing

- [ ] Test manual: `curl .../warm-now` → 200 OK
- [ ] Verificar logs: Ejecución exitosa
- [ ] Test de URLs: `curl -I ...` → cf-cache-status: HIT
- [ ] Esperar 30 min → Verificar ejecución automática
- [ ] Verificar cache hit rate > 85% (después de 24h)

### Monitoreo (ongoing)

- [ ] Revisar logs semanalmente
- [ ] Verificar cache hit rate mensualmente
- [ ] Actualizar sitemap.xml cuando agregues páginas
- [ ] Ajustar frecuencia si es necesario

---

## 🎯 Resultados Esperados

### Antes del Cache Warming

```
👤 Usuario visita https://tudominio.com/productos.html

1. Cloudflare: Cache MISS (no tiene la página)
2. Fetch desde origin (200-500ms)
3. Usuario espera...
4. Página cargada (LENTA)

📊 Métricas:
- Cache Hit Rate: 65%
- TTFB: 250ms
- Origin requests: 35%
```

### Después del Cache Warming

```
🤖 Worker visita todas las páginas cada 30 min

1. Cache se mantiene siempre caliente
2. TTL renovado constantemente

👤 Usuario visita https://tudominio.com/productos.html

1. Cloudflare: Cache HIT ✅
2. Sirve desde cache (10-50ms)
3. Usuario feliz (RÁPIDO)

📊 Métricas:
- Cache Hit Rate: 92% (+27%)
- TTFB: 45ms (-82%)
- Origin requests: 8% (-77%)
```

---

## 🔗 Referencias y Recursos

### Documentación Oficial

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

### Herramientas Útiles

- [Crontab Guru](https://crontab.guru/) - Generador de expresiones cron
- [Sitemap Generator](https://www.xml-sitemaps.com/) - Generador de sitemap.xml
- [Cloudflare Analytics](https://dash.cloudflare.com/analytics) - Dashboard de métricas

### Repositorio

- [Cloudflare-Firewall](https://github.com/Jorguitouy/Cloudflare-Firewall) - Código completo y documentación

---

**Última actualización**: 10 de noviembre de 2025  
**Versión**: 1.0  
**Autor**: Jorguitouy  
**Licencia**: MIT
