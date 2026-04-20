# Plan de hardening preproducción (SOS-X)

> Objetivo: subir seguridad, estabilidad y cumplimiento sin romper funcionalidades existentes.

## 1) Seguridad inmediata (crítico)
- [x] Desactivar logs de depuración en consola del navegador en producción (`console.log/info/debug`).
- [x] Endurecer CORS en backend con lista blanca por variable de entorno (`CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`).
- [x] Bajar límites de body payload por defecto (`BODY_LIMIT`, default `10mb`).
- [x] Deshabilitar `X-Powered-By` y agregar headers de seguridad base.
- [x] Agregar rate limit para endpoints sensibles (`/api/auth/login`, `/api/auth/register`, `/api/legacy/claim`).
- [x] Restringir `/health/db` a `super_admin` autenticado.

## 2) Control de exposición de datos (siguiente bloque)
- [x] Silenciar `console.log/info/debug` del backend en producción (flag `ENABLE_DEBUG_LOGS` para troubleshooting temporal).
- [x] Estandarizar respuestas de error para no exponer `details`/`stack`/`logs` en producción (middleware global).
- [ ] Sustituir logs sensibles backend por logger central con niveles (debug/info/warn/error).
- [ ] Redactar/maskear PII/tokens en logs (emails, teléfonos, refs de pago, payloads crudos).
- [ ] Revisar endpoints de callback/webhook para validar firma y origen cuando aplique.

## 3) Hosts, capacidad y performance
- [ ] Definir topología: API detrás de reverse proxy (Nginx/ALB) + TLS obligatorio.
- [ ] Habilitar compresión HTTP y cache headers en estáticos.
- [ ] Configurar pool de DB y límites de conexiones por ambiente.
- [ ] Definir presupuesto de rendimiento: p95 login, p95 dashboard, p95 consultas críticas.
- [ ] Implementar pruebas de carga (k6/Artillery) para picos esperados.

## 4) Estabilidad operativa
- [ ] Health checks separados: liveness (`/health`) y readiness (`/health/ready`).
- [ ] Timeouts y retries controlados para integraciones externas (OpenPay, Belvo, MJCustomer, etc).
- [ ] Circuit breaker / fallback para proveedores externos críticos.
- [ ] Política de backups y pruebas de restore de BD.

## 5) Gobernanza y observabilidad
- [ ] Correlation ID por request y trazabilidad extremo a extremo.
- [ ] Métricas (latencia, errores, throughput) + alertas (SLA/SLO).
- [ ] Auditoría de cambios críticos (pagos, permisos, configuraciones).
- [ ] Runbooks de incidentes + plan de rollback documentado.

## 6) Criterios de salida a producción
- [ ] Cero secretos en frontend y cero logs sensibles visibles al usuario final.
- [ ] Validación funcional end-to-end en staging (login, pagos, GEX, status flows, marítimo/aéreo).
- [ ] Smoke test post-deploy automático.
- [ ] Ventana de despliegue con monitoreo intensivo + rollback listo.
