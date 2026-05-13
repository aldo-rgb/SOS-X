# 🛡️ EntregaX — Plan de Implementación y Despliegue Seguro a Producción

> **Versión:** 1.0
> **Fecha:** 2026-05-12
> **Audiencia:** Equipo de desarrollo, DevOps, Líder Técnico
> **Regla de oro:** Zero Breakage. Cada cambio debe ser retrocompatible o desplegado en pasos atómicos.

---

## 📊 Estado actual del scan

- 🔴 87 `console.log/info/debug` filtrados al bundle de producción
- 🔴 198 referencias a `localStorage` (incluye tokens JWT)
- 🟡 0 `dangerouslySetInnerHTML` (preventivo, no urgente)
- 🔴 Default password `Entregax123` presente en código/seed
- 🔴 Endpoints `/api/admin/*` sin enforcement de rol consistente
- 🟢 Uploads ya migrados a AWS S3 (commit `0f1ec1a`)

---

## 🚦 FASE 1 — Remediación Crítica (Semana 1) — BLOCKER de prod

### 1.1 Limpieza del bundle frontend
- [ ] Editar `entregax-web-admin/vite.config.ts` añadiendo `esbuild.drop: ['console','debugger']` en modo production
- [ ] `build.sourcemap: false` para no publicar sourcemaps
- [ ] Crear `entregax-web-admin/scripts/check-secrets.sh` que aborte si detecta `sk_live_|Entregax123|aws_secret`
- [ ] Agregar `"prebuild": "bash scripts/check-secrets.sh"` en `package.json`
- [ ] Verificar build local: `npm run build && grep -r "console.log" dist/` → debe estar vacío
- [ ] Validar que `console.error/warn` siguen funcionando (Sentry los necesita)

### 1.2 Rotar credenciales por defecto
- [ ] Buscar y eliminar `Entregax123` del código y seeders
- [ ] Forzar `password_reset_required = true` en cualquier usuario que la tenga en BD
- [ ] Generar nuevo `JWT_SECRET` (64 bytes random) — coordinar ventana porque invalida sesiones
- [ ] Rotar `AWS_SECRET_ACCESS_KEY` con nuevo IAM user limitado a `s3:PutObject` sobre `entregax-uploads/*`
- [ ] Rotar credenciales Stripe / FacturAPI / Belvo si están hardcoded
- [ ] Mover todos los secretos a AWS Secrets Manager o Doppler/Infisical

### 1.3 Migración JWT → Cookies HttpOnly (compatible)
**Backend** (`entregax-backend-api`):
- [ ] `npm i cookie-parser @types/cookie-parser`
- [ ] `app.use(cookieParser())` en `index.ts`
- [ ] Modificar login para emitir cookie `ex_token` (HttpOnly + Secure + SameSite=Strict + 7d)
- [ ] Devolver token TAMBIÉN en body (retrocompat con mobile y clientes viejos)
- [ ] Modificar `authenticateToken` middleware para aceptar `req.cookies.ex_token` O `Authorization: Bearer`
- [ ] Endpoint `POST /api/auth/logout` que ejecuta `res.clearCookie('ex_token')`
- [ ] CORS: `credentials: true`, `origin` whitelist con dominios de producción

**Frontend admin** (`entregax-web-admin`):
- [ ] `withCredentials: true` en instancia Axios ([api.ts](entregax-web-admin/src/services/api.ts#L10))
- [ ] Mantener lectura de `localStorage` en interceptor durante 30 días (compat)
- [ ] Después de D+30 eliminar `localStorage.getItem('token')` del interceptor
- [ ] D+60 dejar de aceptar Authorization header en rutas web (mantener solo con `X-Client: mobile`)

**Mobile** (`entregax-mobile-app`):
- [ ] `npx expo install expo-secure-store`
- [ ] Reemplazar `AsyncStorage.setItem('token', ...)` por `SecureStore.setItemAsync('ex_token', ...)`
- [ ] Migración silenciosa: leer de SecureStore primero, fallback a AsyncStorage
- [ ] Después de 2 builds, limpiar AsyncStorage

### 1.4 BFLA — Enforcement de roles en `/api/admin/*`
- [ ] Crear middleware `requireRole(...roles)` en `authMiddleware.ts`
- [ ] Aplicar globalmente: `app.use('/api/admin', authenticateToken, requireRole('admin','super_admin'))`
- [ ] Aplicar `requireRole('customer_service','admin','super_admin')` a `/api/support/admin/*`
- [ ] Aplicar `requireRole('accountant','admin','super_admin')` a `/api/accounting/*`
- [ ] Pruebas: con token de cliente normal, todas las rutas admin deben devolver 403
- [ ] Documentar matriz de roles en `DEVELOPER_MANUAL.md`

### 1.5 IDOR — Validar propiedad en endpoints `:id`
- [ ] Auditar todos los `req.params.id` en controllers (greppear `req.params.id`)
- [ ] Agregar `WHERE user_id = $userId` (o equivalente) en SELECT/UPDATE/DELETE
- [ ] Para admins, permitir bypass solo si `req.user.role === 'admin'`
- [ ] Test manual: intentar GET `/api/packages/123` con token de otro cliente → 404

---

## 🛡️ FASE 2 — Defensa de API (Semana 2)

### 2.1 Mass Assignment con Zod
- [ ] `cd entregax-backend-api && npm i zod`
- [ ] Crear directorio `src/schemas/`
- [ ] Definir schemas `.strict()` para: UpdateProfile, CreatePackage, UpdateAddress, etc.
- [ ] Reemplazar `req.body` por `Schema.parse(req.body)` en cada controller
- [ ] Middleware global captura `ZodError` → 400 con detalle
- [ ] **Nunca** incluir `role`, `is_admin`, `balance`, `box_id`, `commission_rate` en schemas de usuario final

### 2.2 Rate Limiting
- [ ] `npm i express-rate-limit`
- [ ] Global: 200 req/min por IP
- [ ] `/api/auth/login`: 5 intentos / 15 min
- [ ] `/api/auth/register`: 3 / hora
- [ ] `/api/auth/forgot-password`: 3 / hora
- [ ] `/api/support/public/*`: 10 / hora por IP
- [ ] Mover storage a Redis (`rate-limit-redis`) cuando haya múltiples instancias

### 2.3 Helmet & headers de seguridad
- [ ] `npm i helmet`
- [ ] `app.use(helmet({ contentSecurityPolicy: false }))` (CSP se afina después)
- [ ] `app.disable('x-powered-by')`
- [ ] Validar headers con `securityheaders.com` (objetivo grado A)
- [ ] Configurar CSP estricto cuando se confirmen todos los terceros (Stripe, GA, Sentry)

### 2.4 Sanitización & Validación de Input
- [ ] Validar tamaños máx en `express.json({ limit: '1mb' })`
- [ ] Para uploads: ya está con multer + filtros de mimetype
- [ ] Sanitizar inputs con regex en lugar de confiar en frontend
- [ ] SQL: ya usas parametrized queries en `pg` ✅

### 2.5 Logging seguro
- [ ] Reemplazar `console.log` del backend por `winston` o `pino`
- [ ] **Nunca** loggear: tokens, passwords, números de tarjeta, JWT, body completo
- [ ] Log a archivo + envío a CloudWatch / Datadog
- [ ] Habilitar audit log de acciones admin (quién hizo qué, cuándo, IP)

---

## ☁️ FASE 3 — Infraestructura y Hosting (Semana 3)

### 3.1 Cloudflare WAF
- [ ] Mover DNS de `entregax.app` y `api.entregax.app` a Cloudflare
- [ ] Activar Proxy 🟠 en todos los registros
- [ ] **Bot Fight Mode** ON
- [ ] **Managed Rules:** OWASP Core Ruleset (en modo Log primero, luego Block)
- [ ] **Rate Limiting Rules:**
  - 100 req/min por IP a `/api/auth/*` → Block 10min
  - 1000 req/min global por IP → Challenge
- [ ] Page Rules: cache `/uploads/*` (S3 ya cachea, esto es CDN extra)
- [ ] **Bloquear** acceso directo al backend: firewall server-side acepta solo IPs de Cloudflare ([lista oficial](https://www.cloudflare.com/ips/))

### 3.2 Backend hosting (recomendación)
**Opción A — Rápido (MVP / siguiente trimestre):**
- [ ] Render.com plan Standard ($25/mes) o Railway ($5/mes start)
- [ ] Health check en `/api/health`
- [ ] Auto-deploy desde rama `main`
- [ ] 2 instancias mínimo + scaling rule

**Opción B — Producción seria (cuando justifique):**
- [ ] AWS ECS Fargate, 2+ tasks min, auto-scale CPU > 60%
- [ ] ALB con HTTPS (cert ACM)
- [ ] VPC privada, RDS sin acceso público
- [ ] NAT Gateway para egress

### 3.3 Base de datos
- [ ] Si está en Render/Railway: subir a plan production con backups
- [ ] Si moverá a AWS: RDS PostgreSQL Multi-AZ, `db.t4g.medium` para empezar
- [ ] Snapshots diarios + retención 7 días
- [ ] PgBouncer para connection pooling
- [ ] Cifrado en reposo (AWS KMS)

### 3.4 Frontend hosting
- [ ] Web admin → **Vercel** (ya parece estar ahí) con env `VITE_API_URL=https://api.entregax.app`
- [ ] Habilitar **Vercel Web Application Firewall** (incluido en pro)
- [ ] CSP headers configurados en `vercel.json`

### 3.5 Storage
- [x] ✅ S3 bucket `entregax-uploads` (ya migrado en commit `0f1ec1a`)
- [ ] Activar **versionado** del bucket
- [ ] Activar **cross-region replication** a `us-west-2`
- [ ] Política IAM: el backend solo `s3:PutObject` y `s3:GetObject` en `support/*`, `packages/*`
- [ ] Lifecycle: archivos `support/_test*` se borran a los 7 días
- [ ] CloudFront delante de S3 con OAC para uploads públicos

### 3.6 Monitoreo y Observabilidad
- [ ] **Sentry**: instalar SDK en backend + frontend admin + mobile (DSN único por ambiente)
- [ ] **Uptime monitoring**: Better Stack o Uptime Kuma — alerta a Slack si `/api/health` falla
- [ ] **APM**: Datadog free tier o New Relic
- [ ] **Status page** pública: status.entregax.app
- [ ] **AWS GuardDuty** activado para detección de comportamiento anómalo

### 3.7 Backups y Disaster Recovery
- [ ] Postgres dump nocturno a S3 cifrado (`aws s3 cp ... --sse aws:kms`)
- [ ] Test de restauración mensual (no es backup hasta que se prueba)
- [ ] RTO objetivo: 1 hora · RPO objetivo: 1 hora
- [ ] Runbook de DR documentado en repo

---

## 🔐 FASE 4 — Hardening avanzado (Mes 2)

### 4.1 2FA para admins
- [ ] `npm i speakeasy qrcode`
- [ ] Endpoint `POST /api/auth/2fa/enable` genera secret + QR
- [ ] Login admin requiere 2FA si `role IN ('admin','super_admin')`
- [ ] Backup codes (10 códigos one-time)

### 4.2 Auditoría de dependencias
- [ ] `npm audit --audit-level=high` en CI
- [ ] **Dependabot** o **Renovate** activado en GitHub
- [ ] Snyk scan semanal
- [ ] Lock file commiteado (`package-lock.json`)

### 4.3 Penetration testing
- [ ] Pentest externo (1 vez antes de producción): OWASP Top 10
- [ ] Bug bounty privado en HackerOne (cuando haya tracción)

### 4.4 Compliance / Legal
- [ ] Términos y Condiciones publicados y aceptados en registro
- [ ] Aviso de Privacidad (LFPDPPP México)
- [ ] Logging de consentimiento
- [ ] Endpoint `DELETE /api/auth/me` para derecho al olvido
- [ ] Endpoint `GET /api/auth/me/export` para portabilidad

### 4.5 CI/CD Seguro
- [ ] GitHub Actions con OIDC para deploy a AWS (sin keys hardcoded)
- [ ] Branch protection en `main`: requiere PR + 1 review + CI verde
- [ ] CodeQL scan automático en PRs
- [ ] Secret scanning de GitHub habilitado

---

## ✅ Checklist Pre-Lanzamiento (Go/No-Go)

Antes de anunciar producción real:

- [ ] Fase 1 completada al 100%
- [ ] Fase 2 al 80%+ (rate limiting + Helmet + Zod en endpoints críticos)
- [ ] Cloudflare activo y backend solo acepta IPs CF
- [ ] Sentry capturando errores en los 3 ambientes (mobile, web, backend)
- [ ] Pentest externo aprobado o autoauditoría firmada
- [ ] Backups probados al menos 1 vez con restauración real
- [ ] Status page pública
- [ ] On-call rotation definido
- [ ] Runbook de incidentes (qué hacer si hay caída, breach, DDoS)
- [ ] Términos y Aviso de Privacidad publicados

---

## 📞 Contacto y Escalación

| Severidad | Tiempo de respuesta | A quién |
|---|---|---|
| Sev1 (caída total / breach) | 15 min | Líder técnico + CTO |
| Sev2 (degradación) | 1 hora | On-call dev |
| Sev3 (bug menor) | 1 día | Issue en GitHub |

---

**Última actualización:** 2026-05-12
**Próxima revisión:** después de completar Fase 1
