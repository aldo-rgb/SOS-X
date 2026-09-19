# Tracking de contenedores marítimos — estado y qué falta

Tarea 478. Documento de referencia para retomar el desarrollo cuando lleguen las
fuentes que hoy no existen.

Última actualización: 18-sep-2026.

---

## Qué se pidió

Juan Segura definió **12 pasos** por los que pasa un contenedor, en el documento
*ESTATUS DE CONTENEDORES — TRACKING*. La tarea además pide **contar los días
transcurridos en cada proceso**.

## La decisión de diseño

El cliente **no ve los 12 pasos**. En su portal ya existe una línea de 6 hitos, y
esa se respeta. Los 12 pasos viven en el detalle.

El criterio para repartirlos: en la línea del cliente van los pasos donde **la
carga se mueve de un lugar a otro**; en el detalle, los que son **trámite o
movimiento interno** dentro de un mismo lugar. Un cliente no necesita saber que
se solicitó el pick up en terminal; sí necesita saber que su contenedor cruzó.

| # | Paso | Hito que prende en el cliente | Fuente |
|---|------|------|--------|
| 1 | Documentación enviada para ISF | En Bodega | ELP (pulso `docs_received`) |
| 2 | Confirmación de ISF | — solo detalle | ELP (`procedure_requested`) |
| 3 | Zarpó — ETD / ETA naviera | Ya Zarpó | Naviera / captura manual |
| 4 | Solicitud de pick up en terminal | — solo detalle | ELP (`cbp_signature_received`) |
| 5 | Entrada a almacén El Paso | — solo detalle | **Correo del almacén** |
| 6 | Salida de almacén El Paso | En Tránsito MX | **Correo del almacén** |
| 7 | Cruce internacional | Arribo a Puerto | ELP (`arrived_port`) |
| 8 | Llegada a patio Ciudad Juárez | — solo detalle | Manual (sistema TCG) |
| 9 | Salida de patio Ciudad Juárez | — solo detalle | Manual (sistema TCG) |
| 10 | *(vacío en el documento original)* | — | — |
| 11 | Tránsito Ciudad Juárez → CDMX | En ruta a destino | Manual |
| 12 | Llegada a almacén de destino | Entregado | Manual (EntregaX) |

El **paso 10 se dejó libre a propósito**: viene vacío en el documento de Juan y
renumerar después rompería lo ya registrado.

**Alcance actual:** solo contenedores que van por ELP (`containers.elp_notified_at`
no nulo). Eran **46** al 18-sep-2026. Lo decidió Aldo.

---

## Qué está hecho

### `src/containerTimeline.ts`

- Tabla `container_timeline_events`: un renglón por paso y contenedor, con
  fecha, origen, detalle, fotos y el folio del correo que lo originó. Índice
  único por `(container_id, paso)`: si el mismo aviso vuelve a llegar, **se
  respeta la fecha del primero** — es la que de verdad ocurrió.
- Catálogo `PASOS` con los 12, su etiqueta y a qué hito del cliente alimentan.
- `GET /api/containers/:id/linea-tiempo` — los 12 pasos, los 6 hitos del
  cliente, y los días: `dias_desde_anterior` cuando el paso ya ocurrió, y
  `dias_esperando` cuando no, que es lo que dice **cuánto lleva atorado**.
- `POST /api/containers/:id/linea-tiempo` — registrar un paso a mano. Rechaza
  fechas futuras.
- `POST /api/containers/linea-tiempo/procesar-correos` — correr la lectura de
  correos a mano.

### Correos del almacén de El Paso → pasos 5 y 6

El almacén (**redquadrat**) manda dos avisos por contenedor, que ya llegan al
buzón de Cajito:

- `NEW RECEIVING HAS BEEN CREATED` → entró al almacén (paso 5)
- `NEW SHIPPING HAS BEEN CREATED` → salió del almacén (paso 6)

**Trampa importante, no la pierdan de vista:** en el correo de SALIDA el campo
`Container #` **no es el contenedor marítimo**, es el del camión que lo saca
(ej. `Container #: 539005`). El marítimo va en el texto del mensaje. Por eso se
busca el patrón ISO —4 letras y 7 dígitos— en todo el cuerpo y **no** se lee ese
campo: leerlo fallaría en todas las salidas.

390 de los 391 contenedores tienen formato ISO, así que el empate es confiable.

Las **fotos** del almacén viajan como ligas dentro del HTML del correo, no como
adjuntos. Se rescatan con `extraerEnlaces` de `cajitoCorreosController`.

### El correo también mueve el estatus del contenedor

No basta con dejar el evento: el contenedor avanza de estatus para que se vea
en los tableros y en el portal del cliente.

| Paso | Estatus que pone |
|---|---|
| 5 — Entrada a almacén El Paso | `customs_cleared` (libró la aduana de USA) |
| 6 — Salida de almacén El Paso | `in_transit` (va en camino a México) |

**El estatus solo AVANZA.** Si el contenedor ya va más adelante —porque alguien
lo movió a mano o llegó un pulso posterior— el correo no lo regresa. Un aviso
que llega tarde no debe echar atrás lo que ya se sabe. El orden que se respeta
es: `received_origin` → `consolidated` → `arrived_port` → `customs_cleared` →
`in_transit` → `in_transit_clientfinal` → `delivered`.

Cada cambio queda en `container_status_history` firmado como **Correo almacén
El Paso**, con el asunto y el folio del correo, igual que los pulsos de ELP.

Si estas dos equivalencias no son las correctas, se cambian en
`ESTATUS_POR_PASO` dentro de `containerTimeline.ts`: es un solo lugar.

### Pasos que no hace falta registrar

Hay fechas que ya viven en el contenedor y estaban saliendo vacías:

- **Paso 1** = la fecha de **alta del contenedor**. Así arranca el proceso en el
  sistema: dar de alta el contenedor es cuando se manda la documentación para
  el ISF. Los 46 la tienen.
- **Paso 3** = la salida real del barco y, si no está, el ETD planeado. Hoy solo
  2 de los 46 la tienen capturada.

Lo registrado **siempre gana** sobre lo derivado: si alguien pone la fecha a
mano o llega un pulso, esa es la buena. Se calcula al leer, no se guarda, así
que no hay que migrar nada si cambia el criterio (ver `derivados()`).

### `arrived_port` va al paso 7 (Cruce) — decidido por Aldo el 18-sep-2026

El pulso `arrived_port` de ELP alimenta el **paso 7, Cruce internacional**.

Se dejó anotado porque salta a la vista que no son el mismo evento: llegar al
puerto y cruzar la frontera a México están separados por semanas y por todo el
paso por El Paso. Pero el documento de Juan **no tiene un paso de arribo a
puerto** —brinca de "Zarpó" a "Pick up en terminal"—, así que el pulso o se
mapeaba al 7 o se perdía. Aldo decidió que al Cruce.

Si algún día se quiere el arribo a puerto como paso propio, **no renumerar**:
usar el paso 10, que está libre.

### Pulsos de ELP → pasos 1, 2, 4 y 7

Enganchados en `elpController.ts`, donde el proveedor manda su pulso. **Hoy no
llegan** (ver abajo), pero el camino ya está puesto: cuando ELP empiece a
mandarlos, los pasos se llenan solos sin tocar nada.

---

## Qué falta, y de quién depende

### 1. Que ELP mande sus pulsos — **bloqueado, depende del proveedor**

Al 18-sep-2026 ELP **no está mandando pulsos**. En todo el histórico solo
llegaron 28 de `arrived_port` (el último el 13-ago) y 2 de `docs_received`. Los
8 contenedores notificados el 14-sep tienen **cero eventos**.

Aldo quedó de empujar al proveedor. **En cuanto empiecen, los pasos 1, 2, 4 y 7
se llenan solos**: no hay que programar nada más.

Solo **2 rutas** tienen ELP activo (`maritime_routes.elp_enabled`). Ampliarlo
sube la cobertura sin tocar código.

### 2. API del almacén de El Paso — no existe

El documento la llama *"API RED"*. Hoy los pasos 5 y 6 salen de leer correos.
Cuando exista la API, **sustituye la lectura de correos sin cambiar los pasos**:
solo hay que llamar a `registrarPaso` con `origen: 'api_almacen'`.

Mientras tanto, la fecha que se guarda es **la de llegada del correo**, no la
hora real del movimiento. Es una aproximación buena para contar días, pero si
después se necesita la hora exacta, hay que sacarla del cuerpo del correo o
esperar la API.

### 3. Rastreo de naviera — escrito pero nunca encendido

`vizionController.ts` existe (670 líneas, integración con Vizion Ocean
Visibility, con los códigos SCAC de 13 navieras). Pero en los datos: **0 de 391
contenedores tienen referencia de Vizion**, 0 de Tradlinx, y un solo contenedor
en toda la historia tiene un evento de naviera.

Primero hay que saber **si Vizion está contratada y si hay llave**
(`VIZION_API_KEY`). Al encenderlo, el paso 3 deja de depender de la captura
manual del ETD. Hoy 365 de 391 ya tienen ETA capturada a mano.

### 4. Patio de Ciudad Juárez (pasos 8 y 9) — depende de un tercero

Requieren usuario del sistema **TCG**, que no es nuestro. Mientras no se
consiga, se capturan a mano.

### 5. La pantalla

Falta la vista: el detalle con los 12 pasos y sus días, y conectar los 6 hitos
con la línea que ya ve el cliente (`maritimeStatusSteps` en `DashboardClient.tsx`).
El backend ya entrega todo lo necesario.

---

## Advertencia al retomar

Los 46 contenedores de ELP llevan meses de historia y **esos eventos no se
pueden reconstruir**. En los ya entregados la línea va a salir con huecos. Es
correcto: no se registraron. La respuesta del endpoint lo dice explícitamente
para que nadie confunda un hueco de dato con un hueco de proceso.

Y lo más importante: **una línea de tiempo con pasos que nadie registra es peor
que no tenerla**. Si se publica al cliente antes de que las fuentes alimenten,
se le va a quedar atorada en un hito por semanas. Por eso conviene tenerla
primero del lado interno.
