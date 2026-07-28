# Propuesta: Sistema de Recompensas y Consecuencias para Vendedores — EntregaX

> **Estado:** propuesta / borrador. **No** conectada al sistema. No modifica el backend ni el frontend de comisiones actuales.
> **Entregable interactivo:** `simulador-comisiones.html` (calcula sobre el historial real de `advisor_commissions`).

El objetivo del sistema de ventas es equilibrar **agresividad comercial** (cerrar muchas importaciones) con **ética operativa** (prometer solo lo que logística puede cumplir). Este documento aterriza ese principio en los 7 servicios reales de EntregaX y en los datos que hoy existen.

---

## 0. Cómo se comisiona hoy (baseline)

- Comisión = **% del precio de venta** de la guía, por servicio (tarifas editables en la tabla `commission_rates`).
- Split **50/50** entre subasesor y líder (el líder gana la mitad de lo que venden sus subasesores; en GEX el líder gana $0).
- Estados: `pending` → `paid`. **No hay reversa**: una venta cancelada/reembolsada simplemente deja de aparecer en los tableros.

**Tarifas vigentes:** PO Box 10% · Aéreo China 2.5% · Marítimo 3.75% · DHL Nacional 10% · Nacional 0% · GEX 5% + $325 fijo (comisión fija $325/póliza) · X-Pay = margen residual.

**Huecos detectados:**
1. **TDI Express no tiene tarifa propia** — hoy hereda la de PO Box por default. Debe tener la suya.
2. Comisión sobre **venta**, no sobre margen (decisión: se mantiene sobre venta por continuidad).

---

## FASE 1 — Recompensas

### 1. Comisión base por servicio + acelerador selectivo

| Servicio | Base | Acelerador 1.5× | Recompensa adicional |
|---|---|---|---|
| ✈️ Aéreo China | **2.5%** | ✅ Sí | — |
| 🚀 TDI Express | **2.75%** | ✅ Sí | — |
| 🚢 Marítimo | **3.75%** | ✅ Sí | — |
| 📦 PO Box USA | **10%** | ❌ No | Escalones de volumen |
| 🚚 DHL Nacional | **10%** | ❌ No | Escalones de volumen (mismos que PO Box) |
| 💱 X-Pay | margen residual | ❌ No | Sin bono (ya ganan % alto por operación) |
| 🛡️ GEX | **$325 fijo** | ❌ No | Bono attach graduado |

**Acelerador (solo Aéreo / TDI / Marítimo):** cada asesor tiene una **meta mensual** de venta. 0–120% de la meta → comisión normal; el **excedente por encima del 120% → se paga a 1.5×** (evita que se "relaje" al llegar a la meta). El acelerador NO aplica a PO Box/DHL (10% ya es alto) ni a X-Pay/GEX.

### 2. Escalones de volumen (PO Box + DHL)
Como el 10% ya es alto, la recompensa va por **volumen de guías** (montos fijos, no multiplicador):
- **80 guías/mes → +$500 · 150 → +$1,200 · 250 → +$2,500.**

### 3. Venta cruzada (X-Pay + Seguros) — la zanahoria
- **Bono combo (inmediato):** envío internacional **+ Seguro (GEX) + X-Pay** en la misma venta → **+$500** por esa venta.
- **Bono attach GEX (mensual):** ≥30% de guías del mes con seguro → **$500** · ≥50% → **$1,000**.

### 4. Bonos globales
- **Venta Limpia (trimestral):** bono por clientes cerrados **sin quejas operativas** (`support_tickets`). Empuja a asesorar con tiempos reales en vez de prometer de más.
- **Premio de Lealtad y Estatus (no financiero):** al de mayor **retención de cartera** → **Kit de Bienvenida "Gold"**. *(Medible hoy con `last_transaction_date`/`recovery_status`.)*

---

## FASE 2 — Consecuencias (disciplina progresiva)

El sistema **mide y alerta**; la sanción la **confirma gerencia** (no hay deducción automática).

### A. Gate de Venta Cruzada (freno al bono total)
En lugar de una multa arbitraria, se **condiciona el pago del 100%** a cumplir una cuota mínima de venta cruzada. No le quitas dinero: le dices que su trabajo está **incompleto**.

- **Cuota mensual: ≥3 X-Pay y ≥3 Seguros.**
- Cumple **ambas** → cobra el **100%** de comisiones/bono.
- Cumple **solo una** → topado al **90%** *(escalón intermedio)*.
- **Cero** venta cruzada (llegó a su meta general pero sin X-Pay ni Seguros) → topado al **80%**.

Efecto: los obliga a ofrecer X-Pay y Seguro en cada llamada, sin sentir que se les "roba".
*Medible hoy: operaciones X-Pay (`entangled_payment_requests`) y pólizas (`warranties`) por asesor/mes.*

### B. Palanca operativa — Asignación de leads
Los mejores contactos / clientes grandes → a los **vendedores integrales** (los que venden todo el portafolio). Quien mes tras mes no ofrece seguro/X-Pay → se le **reduce el flujo de clientes premium** (recibe los chicos/fríos), con la explicación clara.
*La asignación ya existe (Central de Leads → "En espera" → asignar asesor), **hoy manual**. Punto de conexión futuro: automatizar el reparto ponderado por desempeño de venta cruzada.*

### C. Disciplina progresiva (N1–N4)

| Nivel | Situación | Acción | ¿Dato hoy? |
|---|---|---|---|
| **N1 · Verbal** | No registra seguimiento en CRM / mal formato | Llamada de atención, sin dinero | ✅ existe |
| **N2 · Escrita** | Prometió 3 días sabiendo que eran 7 (overpromise) | **Pierde la comisión de ese cliente** | ⚠️ falta capturar la promesa (hoy solo ETA en Aéreo/Marítimo) |
| **N3 · Corte de bono** | Robo de cliente ajeno / descuento profundo sin autorización | Se retira **50–100% del bono**; si fue robo, la comisión pasa al asesor original | ✅ descuentos con `autorizado_por`; ⚠️ robo requiere "regla de propiedad" |
| **N4 · Despido** | Fraude: crear pedidos falsos y cancelarlos, o sobornos | Rescisión sin bonos pendientes | ⚠️ reforzar atribución de "quién canceló" |

---

## FASE 3 — Lanzamiento (esta semana)

1. **Regla de Propiedad del Cliente (1 página):** "Quien registre primero los datos en el CRM tiene **30 días de exclusividad**; si no hay avance, se libera." Elimina el 90% de las peleas. *Patrón chartback de 30 días ya existe como referencia; falta la ventana y el log de reasignación.*
2. **Reunión de transparencia (kick-off):** "Queremos que ganen mucho dinero, pero vamos a proteger la calidad de EntregaX. Con honestidad, el esquema no tiene tope; si rompen las reglas, hay penalizaciones."
3. **Firma del reglamento:** entregar el esquema por escrito y firmarlo. Desde ahí, la disciplina progresiva entra en vigor.

---

## Roadmap de datos — qué falta para volverlo oficial

| # | Requisito | Estado | Para qué |
|---|---|---|---|
| 1 | Tabla de metas por asesor (`advisor_sales_targets`) | Crear | Acelerador (denominador de la cuota) |
| 2 | Tarifa TDI Express **2.75%** en `commission_rates` | Crear | Hoy hereda PO Box |
| 3 | Escalones de volumen PO Box/DHL (config) | Crear | Bono por # de guías/mes |
| 4 | Detección de **combo** (envío + Seguro + X-Pay en la misma venta) | Crear | Bono combo $500 |
| 5 | Cálculo mensual de **gate de venta cruzada** (≥3 X-Pay y ≥3 Seguros → tope 100/90/80%) | Crear | Freno al bono total |
| 6 | Captura de la promesa de entrega del vendedor | Crear | N2 overpromise |
| 7 | Ventana de exclusividad + log de reasignación / **reparto ponderado de leads** | Crear | Regla de propiedad / palanca de leads |
| 8 | Atribución confiable de "quién canceló" (`cancelled_by`) | Reforzar | N4 fraude crear-y-cancelar |
| 9 | Estandarizar categoría "queja" en `support_tickets` | Ajustar | Bono Venta Limpia |

**Ya medible hoy** (no requiere crear nada): operaciones X-Pay (`entangled_payment_requests`), pólizas GEX y attach rate (`warranties`), # de guías por servicio (`advisor_commissions`/`packages`), retención (`last_transaction_date`), descuentos con autor (`guias_ajustes_financieros`).

---

## El simulador

`simulador-comisiones.html` calcula el modelo sobre el **historial real** de comisiones (foto de solo lectura, 23 asesores). Permite:
- Ajustar tarifas por servicio, meta, umbral y multiplicador del acelerador, y el bono de venta limpia.
- Ver, por asesor, el desglose por servicio y la comparación **Actual vs Propuesto** (base ajustada + acelerador + bono − consecuencias).
- Ver la tabla del **equipo completo** con el impacto total.
- Marcar consecuencias (N2/N3) que el sistema calcula pero deja "sujeto a confirmación de gerencia".

> La comisión base del simulador es el **histórico real** (ya incluye el split correcto); las capas nuevas (acelerador, bonos, consecuencias) se aplican **encima**.
