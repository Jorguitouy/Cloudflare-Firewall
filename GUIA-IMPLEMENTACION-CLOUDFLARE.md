# 🚀 Guía de Implementación - Cloudflare Pages

## 📋 Checklist Rápido

Antes de implementar en un nuevo sitio, debes modificar **4 secciones críticas** en `_middleware.js`:

- [ ] **Dominios válidos** (2 lugares)
- [ ] **Países permitidos** (Geo-Challenge)
- [ ] **Content Security Policy** (CSP)
- [ ] **Configuración en Cloudflare Dashboard**

---

## 🔧 PASO 1: Modificaciones en `_middleware.js`

### 1.1. Dominios Válidos (Cache Poisoning Protection)

**Ubicación**: Líneas ~580-600

**BUSCAR**:
```javascript
const validHosts = ['calefonesuruguay.uy', 'www.calefonesuruguay.uy'];
```

**CAMBIAR A**:
```javascript
const validHosts = ['tudominio.com', 'www.tudominio.com'];
```

**Ejemplos según tipo de sitio**:

```javascript
// E-commerce con múltiples subdominios
const validHosts = [
  'mitienda.com', 
  'www.mitienda.com',
  'shop.mitienda.com',
  'checkout.mitienda.com'
];

// Blog personal
const validHosts = ['miblog.com', 'www.miblog.com'];

// Landing page
const validHosts = ['landing.com', 'www.landing.com'];

// Múltiples dominios (mismo sitio)
const validHosts = [
  'dominio1.com', 'www.dominio1.com',
  'dominio2.com', 'www.dominio2.com'
];
```

**⚠️ IMPORTANTE**: 
- Siempre incluir versión con `www` y sin `www`
- Cloudflare Pages automáticamente acepta `*.pages.dev` (no agregar)

---

### 1.2. Referer Válidos (Hotlinking Protection)

**Ubicación**: Líneas ~720-730

**BUSCAR**:
```javascript
const hasValidReferer = ['calefonesuruguay.uy', 'www.calefonesuruguay.uy', 'localhost'].some(domain => referer.includes(domain));
```

**CAMBIAR A**:
```javascript
const hasValidReferer = ['tudominio.com', 'www.tudominio.com', 'localhost'].some(domain => referer.includes(domain));
```

**Ejemplo con múltiples dominios**:
```javascript
const hasValidReferer = [
  'tudominio.com',
  'www.tudominio.com',
  'cdn.tudominio.com',      // Si tienes CDN personalizado
  'app.tudominio.com',      // Subdominio de aplicación
  'localhost',              // Desarrollo local
  '127.0.0.1'              // Desarrollo local (IP)
].some(domain => referer.includes(domain));
```

---

### 1.3. Geo-Challenge (Países Permitidos)

**Ubicación**: Líneas ~480-485

**BUSCAR**:
```javascript
const allowedCountries = ['UY', 'BR']; // Uruguay y Brasil sin challenge
```

**CAMBIAR SEGÚN TU MERCADO**:

#### Opción 1: Sitio Local (1 país)
```javascript
const allowedCountries = ['UY']; // Solo Uruguay
```

#### Opción 2: Mercado Regional (Latinoamérica)
```javascript
const allowedCountries = ['AR', 'UY', 'BR', 'CL', 'PY', 'MX', 'CO'];
```

#### Opción 3: E-commerce Global (deshabilitar geo-challenge)
```javascript
const allowedCountries = ['*']; // Todos los países sin challenge
// O comentar toda la sección de Geo-Challenge (líneas 480-580)
```

#### Opción 4: Europa
```javascript
const allowedCountries = ['ES', 'FR', 'DE', 'IT', 'PT', 'GB'];
```

#### Opción 5: Estados Unidos + Canadá
```javascript
const allowedCountries = ['US', 'CA'];
```

**Códigos de países ISO 3166-1 alpha-2**:
- 🇦🇷 Argentina: `AR`
- 🇧🇷 Brasil: `BR`
- 🇨🇱 Chile: `CL`
- 🇨🇴 Colombia: `CO`
- 🇪🇸 España: `ES`
- 🇫🇷 Francia: `FR`
- 🇲🇽 México: `MX`
- 🇵🇪 Perú: `PE`
- 🇵🇾 Paraguay: `PY`
- 🇺🇸 Estados Unidos: `US`
- 🇺🇾 Uruguay: `UY`
- 🇻🇪 Venezuela: `VE`

[Lista completa](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2)

---

### 1.4. Duración del Challenge (Cookie Expiration)

**Ubicación**: Línea ~530

**BUSCAR**:
```javascript
const cookieParams = "; path=/; max-age=300; SameSite=Lax"; // 5 minutos = 300 segundos
```

**OPCIONES DE CONFIGURACIÓN**:

```javascript
// Muy restrictivo (sitio corporativo, datos sensibles)
max-age=180  // 3 minutos

// Moderado (sitio local con poca competencia internacional)
max-age=300  // 5 minutos (CONFIGURACIÓN ACTUAL)

// Permisivo (e-commerce, tráfico internacional legítimo)
max-age=3600 // 1 hora

// Muy permisivo (blog, contenido público)
max-age=86400 // 24 horas
```

**Recomendaciones por tipo de negocio**:

| Tipo de Sitio | Duración Recomendada | Razón |
|---------------|---------------------|-------|
| **Servicio local** | 3-5 min | Frustra scrapers, clientes locales no ven challenge |
| **E-commerce local** | 10-30 min | Balance entre seguridad y experiencia |
| **E-commerce global** | 1-2 horas | Tráfico internacional legítimo |
| **Blog/Contenido** | 24 horas | Prioriza experiencia sobre seguridad |
| **SaaS/App** | Deshabilitar | Usar autenticación propia |

---

### 1.5. Content Security Policy (CSP) - **MÁS IMPORTANTE**

**Ubicación**: Líneas ~850-890

**⚠️ CRÍTICO**: CSP debe configurarse según los servicios externos que uses.

#### 🔍 Cómo identificar qué servicios usas

1. Abre tu sitio en Chrome/Edge
2. Presiona `F12` (DevTools)
3. Ve a la pestaña **Network**
4. Recarga la página
5. Observa todos los dominios externos que aparecen

**Ejemplo de lo que verás**:
```
www.google-analytics.com  ← Google Analytics
fonts.googleapis.com      ← Google Fonts
cdn.jsdelivr.net          ← CDN de librerías
connect.facebook.net      ← Facebook Pixel
```

#### 📝 Plantillas CSP según servicios

##### **Plantilla 1: Sitio Básico (sin servicios externos)**
```javascript
if (contentType.includes('text/html')) {
  newHeaders.set('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
}
```

##### **Plantilla 2: Google Analytics + Google Fonts**
```javascript
if (contentType.includes('text/html')) {
  newHeaders.set('Content-Security-Policy', 
    "default-src 'self'; " +
    
    // Scripts: Self + Google Analytics
    "script-src 'self' 'unsafe-inline' " +
      "https://www.googletagmanager.com " +
      "https://www.google-analytics.com " +
      "https://ssl.google-analytics.com; " +
    
    // Estilos: Self + Google Fonts
    "style-src 'self' 'unsafe-inline' " +
      "https://fonts.googleapis.com; " +
    
    // Imágenes: Self + cualquier HTTPS (para analytics)
    "img-src 'self' data: https:; " +
    
    // Fuentes: Self + Google Fonts
    "font-src 'self' data: " +
      "https://fonts.gstatic.com; " +
    
    // Conexiones: Self + Google Analytics
    "connect-src 'self' " +
      "https://www.google-analytics.com " +
      "https://analytics.google.com " +
      "https://stats.g.doubleclick.net; " +
    
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
}
```

##### **Plantilla 3: Google Analytics + Facebook Pixel + WhatsApp**
```javascript
if (contentType.includes('text/html')) {
  newHeaders.set('Content-Security-Policy', 
    "default-src 'self'; " +
    
    // Scripts: Self + Google + Facebook
    "script-src 'self' 'unsafe-inline' " +
      "https://www.googletagmanager.com " +
      "https://www.google-analytics.com " +
      "https://connect.facebook.net " +
      "https://www.facebook.com; " +
    
    // Estilos: Self
    "style-src 'self' 'unsafe-inline'; " +
    
    // Imágenes: Self + HTTPS (para pixels)
    "img-src 'self' data: https:; " +
    
    // Fuentes: Self
    "font-src 'self' data:; " +
    
    // Conexiones: Self + Google + Facebook + WhatsApp
    "connect-src 'self' " +
      "https://www.google-analytics.com " +
      "https://analytics.google.com " +
      "https://www.facebook.com " +
      "https://connect.facebook.net " +
      "https://graph.facebook.com " +
      "https://api.whatsapp.com; " +
    
    // Frames: Google + Facebook
    "frame-src 'self' " +
      "https://www.google.com " +
      "https://www.facebook.com " +
      "https://web.facebook.com; " +
    
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self' https://api.whatsapp.com/send;"
  );
}
```

##### **Plantilla 4: CDNs de Librerías (Bootstrap, jQuery, etc.)**
```javascript
if (contentType.includes('text/html')) {
  newHeaders.set('Content-Security-Policy', 
    "default-src 'self'; " +
    
    // Scripts: Self + CDNs populares
    "script-src 'self' 'unsafe-inline' " +
      "https://cdn.jsdelivr.net " +
      "https://cdnjs.cloudflare.com " +
      "https://code.jquery.com " +
      "https://stackpath.bootstrapcdn.com; " +
    
    // Estilos: Self + CDNs
    "style-src 'self' 'unsafe-inline' " +
      "https://cdn.jsdelivr.net " +
      "https://cdnjs.cloudflare.com " +
      "https://stackpath.bootstrapcdn.com " +
      "https://fonts.googleapis.com; " +
    
    // Imágenes: Self + data
    "img-src 'self' data: https:; " +
    
    // Fuentes: Self + CDNs + Google Fonts
    "font-src 'self' data: " +
      "https://cdn.jsdelivr.net " +
      "https://cdnjs.cloudflare.com " +
      "https://fonts.gstatic.com; " +
    
    "connect-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
}
```

##### **Plantilla 5: YouTube + Vimeo (Videos Embebidos)**
```javascript
if (contentType.includes('text/html')) {
  newHeaders.set('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    
    // Imágenes: Self + YouTube/Vimeo thumbnails
    "img-src 'self' data: https: " +
      "https://i.ytimg.com " +
      "https://i.vimeocdn.com; " +
    
    "font-src 'self' data:; " +
    "connect-src 'self'; " +
    
    // Frames: YouTube + Vimeo
    "frame-src 'self' " +
      "https://www.youtube.com " +
      "https://www.youtube-nocookie.com " +
      "https://player.vimeo.com; " +
    
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
}
```

##### **Plantilla 6: Stripe Checkout (E-commerce)**
```javascript
if (contentType.includes('text/html')) {
  newHeaders.set('Content-Security-Policy', 
    "default-src 'self'; " +
    
    // Scripts: Self + Stripe
    "script-src 'self' 'unsafe-inline' " +
      "https://js.stripe.com " +
      "https://checkout.stripe.com; " +
    
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    
    // Conexiones: Self + Stripe API
    "connect-src 'self' " +
      "https://api.stripe.com " +
      "https://checkout.stripe.com; " +
    
    // Frames: Stripe Checkout
    "frame-src 'self' " +
      "https://js.stripe.com " +
      "https://checkout.stripe.com; " +
    
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self' https://checkout.stripe.com;"
  );
}
```

#### 🛠️ Cómo Personalizar Tu CSP

**Paso a paso**:

1. **Copia la plantilla más cercana** a tu configuración
2. **Identifica servicios adicionales** en Network tab (DevTools)
3. **Agregar dominios uno por uno**:

```javascript
// Ejemplo: Agregar Hotjar (analytics)
"script-src 'self' 'unsafe-inline' " +
  "https://www.googletagmanager.com " +
  "https://static.hotjar.com " +        // ← NUEVO
  "https://script.hotjar.com; " +       // ← NUEVO

"connect-src 'self' " +
  "https://www.google-analytics.com " +
  "https://vars.hotjar.com " +          // ← NUEVO
  "https://in.hotjar.com; " +           // ← NUEVO
```

4. **Probar en DevTools**:
   - Abre `F12` → **Console**
   - Si ves errores tipo: `"Refused to load script from 'https://example.com' because it violates CSP"`
   - Agregar ese dominio a la directiva correspondiente

5. **Iterar hasta que no haya errores**

---

### 1.6. Opcional: Ajustar Rate Limiting

**Ubicación**: Líneas ~25-45

**CONFIGURACIÓN ACTUAL**:
```javascript
const RATE_LIMITS = {
  js_css: 12,    // 12 archivos JS/CSS por minuto
  images: 30,    // 30 imágenes por minuto
  window: 60000  // Ventana de 1 minuto
};

const VELOCITY_CONFIG = {
  requests: 25,    // 25 requests en 10 segundos
  window: 10000
};
```

**Ajustes según tipo de sitio**:

```javascript
// GALERÍA DE IMÁGENES (muchas imágenes)
const RATE_LIMITS = {
  js_css: 20,
  images: 100,   // ← Aumentar
  window: 60000
};
const VELOCITY_CONFIG = {
  requests: 50,  // ← Aumentar
  window: 10000
};

// LANDING PAGE MINIMALISTA (pocos recursos)
const RATE_LIMITS = {
  js_css: 8,
  images: 15,    // ← Disminuir
  window: 60000
};
const VELOCITY_CONFIG = {
  requests: 15,  // ← Disminuir
  window: 10000
};

// SPA (Single Page Application - carga una vez)
const RATE_LIMITS = {
  js_css: 30,    // ← Aumentar (muchos chunks)
  images: 50,
  window: 120000 // ← 2 minutos
};
const VELOCITY_CONFIG = {
  requests: 50,
  window: 15000  // ← 15 segundos
};
```

---

## ⚙️ PASO 2: Configuración en Cloudflare Dashboard

### 2.1. Subir el Archivo

**Opción A: Git (Recomendado)**
```bash
# 1. Clonar tu repositorio de Pages
git clone https://github.com/tuusuario/tu-repo.git
cd tu-repo

# 2. Crear carpeta functions/ (si no existe)
mkdir functions

# 3. Copiar _middleware.js (ya modificado)
cp /ruta/al/_middleware.js functions/_middleware.js

# 4. Commit y push
git add functions/_middleware.js
git commit -m "feat: Agregar middleware de seguridad 19 capas"
git push origin main

# Cloudflare Pages detectará y desplegará automáticamente
```

**Opción B: Dashboard Manual**

1. Ve a [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click en **Pages**
3. Selecciona tu proyecto
4. Click en **Deployments** → **Upload Assets**
5. Arrastra la carpeta `functions/` con `_middleware.js` dentro
6. Click en **Save and Deploy**

---

### 2.2. Configurar Variables de Entorno (Opcional)

Si quieres hacer configuraciones dinámicas:

1. Ve a **Pages** → Tu proyecto → **Settings** → **Environment Variables**
2. Agregar variables:

```
ALLOWED_COUNTRIES=UY,BR,AR
CHALLENGE_DURATION=300
RATE_LIMIT_JS=12
RATE_LIMIT_IMAGES=30
```

3. Modificar `_middleware.js` para leer variables:

```javascript
// En lugar de:
const allowedCountries = ['UY', 'BR'];

// Usar:
const allowedCountries = (context.env.ALLOWED_COUNTRIES || 'UY,BR').split(',');
```

---

### 2.3. Configurar Custom Domain

**IMPORTANTE**: El middleware validará tu dominio custom.

1. Ve a **Pages** → Tu proyecto → **Custom domains**
2. Click en **Set up a custom domain**
3. Ingresa tu dominio: `tudominio.com`
4. Sigue las instrucciones de DNS:
   - **CNAME**: `tudominio.com` → `tu-proyecto.pages.dev`
   - **CNAME**: `www.tudominio.com` → `tu-proyecto.pages.dev`
5. Espera a que DNS propague (5-60 minutos)

---

### 2.4. Verificar HTTPS/SSL

1. Ve a **SSL/TLS** → **Overview**
2. Asegúrate de que esté en **Full (strict)** o **Full**
3. Ve a **Edge Certificates**
4. Habilitar:
   - ✅ **Always Use HTTPS**
   - ✅ **Automatic HTTPS Rewrites**
   - ✅ **Minimum TLS Version**: 1.2

---

### 2.5. (Opcional) Configurar Cache Rules

Complementa el middleware con cache rules de Cloudflare:

1. Ve a **Caching** → **Cache Rules**
2. Click en **Create rule**
3. Configuración para assets:

```
Rule name: Cache Static Assets
If: URI Path matches regex: \.(js|css|png|jpg|jpeg|svg|webp|gif|woff2?)$
Then:
  - Cache eligibility: Eligible for cache
  - Edge TTL: 7 days
  - Browser TTL: 7 days
```

4. Configuración para HTML:

```
Rule name: Cache HTML with Revalidation
If: URI Path matches regex: \.(html|htm)$ OR URI Path equals /
Then:
  - Cache eligibility: Eligible for cache
  - Edge TTL: 2 hours
  - Browser TTL: 1 hour
```

---

## 🧪 PASO 3: Testing y Validación

### 3.1. Test Básico de Funcionamiento

```powershell
# Test 1: Verificar que el sitio carga
curl -I https://tudominio.com

# Debes ver estos headers:
# X-Security-Layers: 19
# X-Middleware-Version: v3.0-2025-11-09
# X-Content-Type-Options: nosniff
# X-Frame-Options: SAMEORIGIN
```

### 3.2. Test de Bloqueo de Bots

```powershell
# Test 2: Simular bot (debe bloquearse)
curl -A "curl/7.68" https://tudominio.com
# Esperado: 403 Forbidden

# Test 3: Simular Googlebot (debe pasar)
curl -A "Googlebot/2.1" https://tudominio.com
# Esperado: 200 OK
```

### 3.3. Test de Rate Limiting

```powershell
# Test 4: Hacer 15+ requests rápidos a una imagen
for ($i=0; $i -lt 15; $i++) { 
  curl https://tudominio.com/logo.png
  Write-Host "Request $i"
}

# Esperado: Primeros 12 pasan, resto 429 Too Many Requests
```

### 3.4. Test de Geo-Challenge

```powershell
# Test 5: Usar VPN fuera de tus países permitidos
# 1. Conectar VPN a país no permitido (ej: Francia si solo permitiste UY/BR)
# 2. Visitar https://tudominio.com
# Esperado: Ver página de JavaScript Challenge

# Test 6: Verificar que bots pasan sin challenge
curl -A "Googlebot/2.1" https://tudominio.com
# Esperado: 200 OK (sin challenge)
```

### 3.5. Test de CSP

1. Abre tu sitio en Chrome
2. Presiona `F12`
3. Ve a la pestaña **Console**
4. Si hay errores de CSP:
   - `"Refused to load..."`
   - Agregar esos dominios a tu CSP
5. Refresca hasta que **no haya errores**

### 3.6. Test de Cache Poisoning

```powershell
# Test 7: Intentar enviar Host header falso
curl -H "Host: sitio-malicioso.com" https://tudominio.com
# Esperado: 400 Bad Request

# Test 8: Intentar enviar X-Forwarded-Host
curl -H "X-Forwarded-Host: evil.com" https://tudominio.com
# Esperado: 400 Bad Request
```

---

## 📊 PASO 4: Monitoreo Post-Despliegue

### 4.1. Ver Logs en Cloudflare

1. Ve a **Pages** → Tu proyecto → **Functions**
2. Click en **Logs**
3. Verás logs del middleware:
   ```
   🔍 Geo Challenge - Country: FR, Cookies: ...
   ✅ Geo Challenge pasado - Cookie válida para IP: 1.2.3.4
   ⚠️ CACHE POISONING ATTEMPT: Invalid Host
   🚨 MIME peligroso bloqueado: application/x-msdownload
   ```

### 4.2. Métricas a Observar

Ve a **Analytics** → Tu proyecto:

- **Requests**: Debe mantener nivel normal
- **Bandwidth**: Debe bajar (menos bots/scrapers)
- **Status Codes**:
  - 200: Tráfico legítimo
  - 403: Bots/scrapers bloqueados
  - 429: Rate limiting activado

### 4.3. Alertas en Cloudflare (Opcional)

1. Ve a **Notifications**
2. Click en **Add notification**
3. Configurar alertas:
   - **429 Responses**: Si aumentan >10% → Posible ataque DDoS
   - **403 Responses**: Si aumentan >50% → Posible scraping masivo

---

## 🔧 PASO 5: Troubleshooting Común

### Problema 1: "Usuarios legítimos bloqueados"

**Síntomas**: Clientes reportan 403 en tu país permitido

**Solución**:
1. Verificar código de país en logs de Cloudflare
2. Agregar ese país a `allowedCountries`
3. O aumentar duración del challenge cookie

### Problema 2: "CSP bloqueando recursos"

**Síntomas**: Estilos/scripts no cargan, errores en consola

**Solución**:
1. Abrir DevTools → Console
2. Ver qué dominio está bloqueado
3. Agregar ese dominio a la directiva CSP correspondiente
4. Redesplegar

### Problema 3: "Rate limiting muy agresivo"

**Síntomas**: Usuarios reales reciben 429

**Solución**:
1. Aumentar límites en `RATE_LIMITS`
2. O aumentar ventana de tiempo
3. O deshabilitar para `same-origin`

### Problema 4: "Google no indexa el sitio"

**Síntomas**: Bajada en Search Console

**Solución**:
1. Verificar que `allowedBots` incluya `'googlebot'`
2. Test: `curl -A "Googlebot/2.1" https://tudominio.com`
3. Debe dar 200 OK sin challenges

### Problema 5: "Cambios no se aplican"

**Síntomas**: Modificaciones en _middleware.js no funcionan

**Solución**:
1. Hacer commit y push a Git
2. Esperar despliegue (1-3 minutos)
3. Limpiar cache:
   - Cloudflare Dashboard → **Caching** → **Purge Everything**
4. Probar en modo incógnito

---

## 📋 Checklist Final de Implementación

Antes de marcar como completo, verifica:

### Modificaciones en Código
- [ ] `validHosts` actualizado con tu dominio
- [ ] `hasValidReferer` actualizado con tu dominio
- [ ] `allowedCountries` configurado según tu mercado
- [ ] `challengeDuration` ajustado (si necesario)
- [ ] CSP configurado con TODOS tus servicios externos
- [ ] Rate limits ajustados (si necesario)

### Configuración en Cloudflare
- [ ] `_middleware.js` subido a `functions/` folder
- [ ] Custom domain configurado
- [ ] DNS propagado (test con `nslookup tudominio.com`)
- [ ] HTTPS habilitado (SSL Full/Full Strict)
- [ ] Cache rules creadas (opcional)

### Testing
- [ ] Sitio carga normalmente (200 OK)
- [ ] Headers de seguridad presentes (`X-Security-Layers: 19`)
- [ ] Bots bloqueados (`curl` da 403)
- [ ] Googlebot pasa (`curl -A "Googlebot"` da 200)
- [ ] Rate limiting funciona (15+ requests rápidos → 429)
- [ ] Geo-challenge funciona (VPN extranjero → challenge)
- [ ] CSP sin errores (Console sin "Refused to load")

### Monitoreo
- [ ] Logs de Functions visible en Dashboard
- [ ] Analytics muestra métricas normales
- [ ] Google Search Console sin errores (esperar 24-48h)
- [ ] No reportes de usuarios bloqueados

---

## 🚀 Despliegue Multi-Sitio (8+ proyectos)

Si tienes que desplegar en 8 sitios diferentes:

### Estrategia Eficiente

1. **Crear template base**:
   ```bash
   # Copiar _middleware.js a template
   cp _middleware.js _middleware.template.js
   ```

2. **Script de personalización** (PowerShell):
   ```powershell
   # deploy-middleware.ps1
   param(
       [string]$siteName,
       [string]$domain,
       [string]$countries
   )
   
   $template = Get-Content "_middleware.template.js"
   
   # Reemplazar placeholders
   $template = $template -replace "calefonesuruguay.uy", $domain
   $template = $template -replace "\['UY', 'BR'\]", "[$countries]"
   
   # Guardar para el sitio específico
   $outputPath = "$siteName/functions/_middleware.js"
   New-Item -ItemType Directory -Force -Path "$siteName/functions"
   Set-Content -Path $outputPath -Value $template
   
   Write-Host "✅ Middleware generado para $siteName"
   ```

3. **Desplegar cada sitio**:
   ```powershell
   # Sitio 1
   .\deploy-middleware.ps1 -siteName "sitio1" -domain "dominio1.com" -countries "'AR','UY'"
   
   # Sitio 2
   .\deploy-middleware.ps1 -siteName "sitio2" -domain "dominio2.com" -countries "'BR','CL'"
   
   # ... repetir para los 8 sitios
   ```

4. **Commit masivo**:
   ```bash
   # Para cada sitio
   cd sitio1
   git add functions/_middleware.js
   git commit -m "feat: Middleware de seguridad 19 capas"
   git push origin main
   
   cd ../sitio2
   # ... repetir
   ```

---

## 📞 Soporte y Mantenimiento

### Actualizaciones Futuras

Para actualizar el middleware en todos los sitios:

1. Modificar `_middleware.template.js`
2. Re-ejecutar script de personalización
3. Commit y push a cada repo

### Backup y Rollback

```bash
# Antes de desplegar, hacer backup
git checkout -b backup-antes-middleware
git push origin backup-antes-middleware

# Si algo sale mal:
git checkout main
git revert HEAD
git push origin main
```

### Documentación por Sitio

Crear `SECURITY-CONFIG.md` en cada repo con:

```markdown
# Configuración de Seguridad - [Nombre del Sitio]

## Dominio
- Principal: dominio.com
- Con www: www.dominio.com

## Geo-Challenge
- Países permitidos: UY, BR
- Duración cookie: 5 minutos

## CSP Servicios
- Google Analytics: ✅
- Facebook Pixel: ❌
- WhatsApp: ✅

## Rate Limits
- JS/CSS: 12/min
- Imágenes: 30/min
- Velocity: 25 req/10s

## Última actualización
- Fecha: 9 Nov 2025
- Versión: v3.0
```

---

## ✅ Resumen Ejecutivo

**Para implementar en un nuevo sitio de Cloudflare Pages**:

1. ✏️ **Modificar 4 secciones**: dominios, referers, países, CSP
2. 📤 **Subir a `functions/_middleware.js`** vía Git o Dashboard
3. ⚙️ **Configurar custom domain** en Cloudflare
4. 🧪 **Probar** con curl y DevTools
5. 📊 **Monitorear** logs y analytics

**Tiempo estimado**: 15-30 minutos por sitio (primera vez)

**Mantenimiento**: Revisar logs 1x semana, actualizar CSP si agregas servicios

---

**Última actualización**: 9 de noviembre de 2025  
**Versión**: v1.0
