# Cloudflare WAF Playbook — EntregaX

Configuración paso a paso del WAF de Cloudflare delante de Railway (backend) y Vercel (admin/landing). **Sin código** — todo en el dashboard de Cloudflare.

> Pre-req: Plan **Pro** mínimo ($20/mes) para WAF Managed Rules + Rate Limiting decente. Free funciona solo para DNS proxy + Bot Fight Mode básico.

---

## 1. DNS + Proxy

**Cloudflare → tu zona → DNS → Records**

| Registro | Tipo | Destino | Proxy |
|----------|------|---------|-------|
| `api.entregax.com` (o tu dominio backend) | CNAME | `sos-x-production.up.railway.app` | 🟠 Proxied ✅ |
| `entregax.app` / `www.entregax.app` (admin) | CNAME | `cname.vercel-dns.com` | 🟠 Proxied ✅ |
| `entregax.com` / `www` (landing) | A/CNAME | tu servidor Apache | 🟠 Proxied ✅ |
| MX / SPF / DKIM / DMARC | TXT/MX | (AWS SES / proveedor) | ⚪ **DNS only** ❌ |

⚠️ **NUNCA** proxiar registros de correo (MX, SPF, DKIM, DMARC) — Cloudflare no soporta SMTP.

Después configurar Custom Domain en Railway → Settings → Networking, y en Vercel → Project → Domains.

---

## 2. SSL/TLS

**SSL/TLS → Overview**
- ✅ Modo: **Full (strict)** (Railway y Vercel ya sirven TLS válido)

**SSL/TLS → Edge Certificates**
- ✅ **Always Use HTTPS**: On
- ✅ **HSTS**: Enable
  - Max age: `31536000` (1 año)
  - Apply HSTS to subdomains: On
  - Preload: On
  - No-Sniff Header: On
- ✅ **Minimum TLS Version**: 1.2
- ✅ **Opportunistic Encryption**: On
- ✅ **TLS 1.3**: On
- ✅ **Automatic HTTPS Rewrites**: On

---

## 3. Security → WAF → Managed Rules

**Deploy estos dos ruleset:**

1. **Cloudflare Managed Ruleset** → Deploy (default ON en Pro)
   - Cubre OWASP Top 10, CVEs conocidos, exploits comunes

2. **Cloudflare OWASP Core Ruleset** → Deploy
   - **Paranoia Level**: PL2
     - PL1 = pocos falsos positivos, cobertura básica
     - PL2 = balance recomendado ⭐
     - PL3+ = puede romper uploads de imágenes y forms con HTML

---

## 4. Security → WAF → Custom Rules

Crear estas **5 reglas en orden** (skip las que no apliquen a tu modelo):

### Regla A — Bloquear países sancionados
```
(ip.geoip.country in {"KP" "RU" "IR" "SY" "CU"})
```
**Action**: Block

### Regla B — Proteger endpoints sensibles de bots
```
(http.request.uri.path contains "/api/auth/"
 or http.request.uri.path contains "/api/payments/"
 or http.request.uri.path contains "/api/verify/")
and (cf.bot_management.score lt 30)
```
**Action**: Managed Challenge

### Regla C — Bloquear scrapers comunes
```
(lower(http.user_agent) contains "curl"
 or lower(http.user_agent) contains "python-requests"
 or lower(http.user_agent) contains "go-http-client"
 or lower(http.user_agent) contains "scrapy"
 or lower(http.user_agent) contains "wget"
 or lower(http.user_agent) contains "httpie"
 or lower(http.user_agent) contains "postman")
and not (http.request.uri.path eq "/health"
         or http.request.uri.path eq "/api/health"
         or http.request.uri.path contains "/webhooks/")
```
**Action**: Managed Challenge (NO Block — integraciones legítimas pueden usar curl/python)

### Regla D — POST/PUT/DELETE/PATCH solo con Content-Type válido
```
(http.request.method in {"POST" "PUT" "PATCH" "DELETE"})
and not (
  any(http.request.headers["content-type"][*] contains "application/json")
  or any(http.request.headers["content-type"][*] contains "multipart/form-data")
  or any(http.request.headers["content-type"][*] contains "application/x-www-form-urlencoded")
)
and not http.request.uri.path contains "/webhooks/"
```
**Action**: Block

### Regla E — Paths de scanning conocidos
```
(http.request.uri.path contains "/.env"
 or http.request.uri.path contains "/.git"
 or http.request.uri.path contains "/wp-admin"
 or http.request.uri.path contains "/wp-login"
 or http.request.uri.path contains "/phpmyadmin"
 or http.request.uri.path contains "/.aws"
 or http.request.uri.path contains "/.ssh"
 or http.request.uri.path contains "/config.php"
 or http.request.uri.path contains "/xmlrpc.php"
 or http.request.uri.path contains "/.well-known/security.txt" and false)
```
**Action**: Block

---

## 5. Security → Rate Limiting Rules (Pro+)

Capa defensa adicional al rate-limit que ya tiene Express.

### RL-1 — Login brute force
- **Path**: `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`
- **Match**: same IP
- **Threshold**: 10 requests / 1 minute
- **Action**: Block 1 hora

### RL-2 — API general
- **Path**: `/api/*`
- **Match**: same IP
- **Threshold**: 300 requests / 1 minute
- **Action**: Managed Challenge

### RL-3 — Webhooks (excepción)
- Skip rate limiting en `/api/webhooks/*` para no bloquear PayPal/Stripe.

---

## 6. Security → Bots

**Bot Fight Mode**: On (Free+)

**Super Bot Fight Mode** (Pro+):
- Definitely automated → Block
- Likely automated → Managed Challenge
- Verified bots (Google, Apple) → Allow
- Static resource protection → On

---

## 7. Security → Settings

- **Security Level**: Medium (default) o High si recibes ataques
- **Challenge Passage**: 30 min
- **Browser Integrity Check**: On

---

## 8. Page Rules / Cache Rules

### Backend (api.entregax.com)
- Cache Level: **Bypass** (API no debe cachearse)
- Disable Apps
- Disable Performance

### Admin (entregax.app)
- Cache Level: Standard
- Edge Cache TTL: 4h para `/assets/*`, `/static/*`
- Bypass cache para rutas con query strings sensibles

---

## 9. Logs / Analytics

**Security → Events**: revisar primeras 48h tras deploy para detectar falsos positivos. Si Regla X bloquea tráfico legítimo, agregar excepción.

**Notifications**:
- Activar "DDoS attack detected"
- Activar "Spike in 5xx errors"

---

## 10. Checklist final

- [ ] DNS proxiado (naranja) en `api`, `admin`, `www`
- [ ] MX/SPF/DKIM **NO** proxiados (gris)
- [ ] SSL Full (strict)
- [ ] HSTS preload activo
- [ ] Managed Ruleset deployed
- [ ] OWASP PL2 deployed
- [ ] 5 Custom Rules creadas
- [ ] 3 Rate Limiting rules creadas
- [ ] Bot Fight Mode On
- [ ] Notificaciones activadas
- [ ] Probar login + checkout + webhooks por 48h y ajustar falsos positivos

---

## Verificación rápida (curl)

```bash
# Debe responder con header cf-ray
curl -sI https://api.entregax.com/health | grep -i cf-ray

# Debe responder 403 / challenge
curl -A "Scrapy/2.0" https://api.entregax.com/api/auth/login -d '{}' \
  -H "Content-Type: application/json"

# Debe responder con HSTS preload
curl -sI https://api.entregax.com/ | grep -i strict-transport
```
