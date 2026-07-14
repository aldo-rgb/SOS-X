# Manual de Integración — API ELP (EntregaX)

**Versión:** 1.0
**Última actualización:** 2026-07-14
**Contacto técnico EntregaX:** aldo@zaia.mx

---

## 1. Introducción

Esta API permite al proveedor **ELP** integrarse con la plataforma de EntregaX para:

1. **Consultar** los contenedores marítimos asignados a rutas habilitadas para ELP.
2. **Descargar** los documentos de cada contenedor (BL, Telex/ISF, ISF Word, Invoice, Packing List).
3. **Reportar el avance del trámite** enviando "pulsos" de estatus a EntregaX.

El flujo típico es:

```
1. Se registra un contenedor en EntregaX (ruta ELP)
        │
        ▼
2. EntregaX envía un correo de aviso  ──►  ELP recibe la notificación
        │
        ▼
3. ELP hace GET de los documentos  ──►  (o descarga el ZIP)
        │
        ▼
4. ELP realiza el trámite y va enviando pulsos de estatus (POST) a EntregaX
   docs_received ─► procedure_requested ─► cbp_signature_received ─► arrived_port
```

---

## 2. Datos de conexión

| Concepto | Valor |
|---|---|
| **URL base (producción)** | `https://api.entregax.app` |
| **Autenticación** | Header `X-ELP-Api-Key` |
| **API Key** | *Se entrega por canal seguro, por separado de este documento.* |
| **Formato** | JSON (UTF-8) |
| **Identificador de contenedor** | **Número de contenedor** (`container_number`), ej. `ONEU4343977` |

> ⚠️ **Importante:** El identificador que se usa en todas las URLs (`{container}`) es el **número de contenedor**, no el BL ni la referencia interna.

---

## 3. Autenticación

Todas las peticiones (excepto la descarga ZIP por link, ver §7) deben incluir el header:

```
X-ELP-Api-Key: TU_API_KEY_AQUI
```

Si el header falta o es inválido, la API responde **HTTP 401**:

```json
{ "error": "API key inválida" }
```

---

## 4. Endpoint: Listar contenedores

Devuelve todos los contenedores en rutas habilitadas para ELP.

**Request**
```
GET /api/elp/containers
X-ELP-Api-Key: TU_API_KEY_AQUI
```

**Response `200 OK`**
```json
{
  "ok": true,
  "count": 2,
  "containers": [
    {
      "container_number": "ONEU4343977",
      "bl_number": "ONEYNB6JBD537800",
      "reference_code": "EPG26-0137",
      "status": "in_transit",
      "route_code": "CHN-LAX-ELP-MXC",
      "week_number": "S2690",
      "eta": "2026-07-28T00:00:00.000Z",
      "elp_notified_at": "2026-07-14T21:06:36.859Z"
    }
  ]
}
```

| Campo | Descripción |
|---|---|
| `container_number` | **Identificador** que se usa en las demás llamadas |
| `bl_number` | Número de Bill of Lading |
| `reference_code` | Referencia interna de EntregaX (informativa) |
| `status` | Estatus actual del contenedor (ver §8) |
| `route_code` | Código de la ruta |
| `week_number` | Semana de embarque |
| `eta` | Fecha estimada de arribo (ISO 8601, UTC) |
| `elp_notified_at` | Fecha/hora en que se notificó a ELP (o `null`) |

---

## 5. Endpoint: Obtener documentos de un contenedor

Devuelve las URLs de descarga de los documentos del contenedor.

**Request**
```
GET /api/elp/containers/{container}/documents
X-ELP-Api-Key: TU_API_KEY_AQUI
```
Ejemplo: `GET /api/elp/containers/ONEU4343977/documents`

**Response `200 OK`**
```json
{
  "ok": true,
  "container_number": "ONEU4343977",
  "bl_number": "ONEYNB6JBD537800",
  "reference_code": "EPG26-0137",
  "route_code": "CHN-LAX-ELP-MXC",
  "status": "in_transit",
  "documents": {
    "bl":           "https://entregax-uploads.s3.us-east-1.amazonaws.com/.../bl.pdf?X-Amz-Signature=...",
    "telex_isf":    "https://entregax-uploads.s3.us-east-1.amazonaws.com/.../telex.pdf?X-Amz-Signature=...",
    "isf_word":     "https://entregax-uploads.s3.us-east-1.amazonaws.com/.../isf.docx?X-Amz-Signature=...",
    "invoice":      "https://entregax-uploads.s3.us-east-1.amazonaws.com/.../invoice.pdf?X-Amz-Signature=...",
    "packing_list": "https://entregax-uploads.s3.us-east-1.amazonaws.com/.../packing.xlsx?X-Amz-Signature=..."
  },
  "zip_url": "https://api.entregax.app/api/elp/containers/ONEU4343977/zip?token=..."
}
```

| Documento | Descripción |
|---|---|
| `bl` | Bill of Lading (PDF) |
| `telex_isf` | Telex Release / ISF (PDF o imagen) |
| `isf_word` | ISF en Word (.doc/.docx) |
| `invoice` | Invoice (PDF) |
| `packing_list` | Packing List (Excel) |
| `zip_url` | Link para descargar **todos** los documentos en un ZIP (ver §7) |

> 📌 **Notas sobre las URLs de documentos:**
> - Son **URLs firmadas** de Amazon S3, **válidas por 7 días**. Si expiran, vuelve a llamar este endpoint para obtener URLs nuevas.
> - Un documento que no fue subido llega como `null`. Descarga solo los que no sean `null`.
> - Descarga los archivos con un simple `GET` (sin headers adicionales); la firma va en la URL.

---

## 6. Endpoint: Enviar pulso de estatus  ⭐ (donde ELP reporta el avance)

**Este es el endpoint donde ELP debe mandar los pulsos de información de estatus.**

**Request**
```
POST /api/elp/containers/{container}/status
X-ELP-Api-Key: TU_API_KEY_AQUI
Content-Type: application/json

{
  "status": "docs_received",
  "notes": "Documentos recibidos y validados"   // opcional
}
```
Ejemplo: `POST /api/elp/containers/ONEU4343977/status`

**Response `200 OK`**
```json
{
  "ok": true,
  "container_number": "ONEU4343977",
  "previous_status": "in_transit",
  "new_status": "docs_received",
  "label": "Documentos Recibidos"
}
```

### Valores de `status` permitidos (los 4 estatus que maneja ELP)

| `status` (enviar este valor) | Significado |
|---|---|
| `docs_received` | **Documentos Recibidos** — ELP recibió y validó la documentación |
| `procedure_requested` | **Trámite Solicitado** — se inició el trámite aduanal |
| `cbp_signature_received` | **Firma Electrónica CBP Recibida** — se recibió la firma electrónica de CBP |
| `arrived_port` | **Arribo a Puerto** — el contenedor arribó al puerto |

> El campo `notes` es **opcional**: texto libre que queda registrado en el historial del contenedor.
> Se pueden enviar los pulsos en el orden en que ocurran; cada pulso actualiza el estatus del contenedor en EntregaX.

**Si se envía un `status` no permitido → `400 Bad Request`:**
```json
{
  "error": "Estado inválido para ELP",
  "allowed": ["docs_received", "procedure_requested", "cbp_signature_received", "arrived_port"]
}
```

---

## 7. Descarga de todos los documentos en ZIP

Existen dos formas de obtener un ZIP con todos los documentos:

**a) Usando el `zip_url`** que devuelve el endpoint de documentos (§5). Es un link público con token, se descarga con un `GET` directo (sin header):
```
GET https://api.entregax.app/api/elp/containers/ONEU4343977/zip?token=...
```

**b) El mismo link llega en el correo de aviso** (ver §9), en el botón **"Descargar todos los documentos (ZIP)"**.

La respuesta es un archivo `application/zip` (`{container}_documentos.zip`) con los documentos disponibles.

---

## 8. Ciclo de vida del estatus del contenedor (contexto)

El contenedor pasa por varios estatus en EntregaX. **ELP es responsable de reportar los 4 marcados con ⭐:**

| Orden | `status` | Etiqueta | Responsable |
|---|---|---|---|
| 1 | `received_origin` | Recibido en China | EntregaX |
| 2 | `consolidated` | Contenedor cerrado | EntregaX |
| 3 | `in_transit` | Ya Zarpó | EntregaX |
| 4 | `docs_received` ⭐ | Documentos Recibidos | **ELP** |
| 5 | `procedure_requested` ⭐ | Trámite Solicitado | **ELP** |
| 6 | `cbp_signature_received` ⭐ | Firma Electrónica CBP Recibida | **ELP** |
| 7 | `arrived_port` ⭐ | Arribo a Puerto | **ELP** |
| 8 | `customs_cleared` | Liberado | EntregaX |
| 9 | `in_transit_clientfinal` | En Ruta a CEDIS | EntregaX |
| 10 | `delivered` | Entregado | EntregaX |

---

## 9. Notificación por correo (aviso de nuevo contenedor)

Cuando se registra un contenedor en una ruta habilitada para ELP, EntregaX envía **automáticamente un correo de aviso** con:

- Datos del contenedor (número, BL, referencia, ruta, semana).
- Un botón **"Descargar todos los documentos (ZIP)"**.

Al recibir ese correo, ELP puede:
1. Descargar el ZIP directamente desde el botón, **o**
2. Llamar `GET /api/elp/containers/{container}/documents` para obtener las URLs individuales.

> Alternativamente, ELP puede **consultar periódicamente** `GET /api/elp/containers` (polling) para detectar contenedores nuevos sin depender del correo.

---

## 10. Códigos de respuesta HTTP

| Código | Significado |
|---|---|
| `200 OK` | Operación exitosa |
| `400 Bad Request` | Estatus inválido (revisar lista `allowed`) |
| `401 Unauthorized` | Falta o es inválida la `X-ELP-Api-Key` |
| `403 Forbidden` | El contenedor pertenece a una ruta **no** habilitada para ELP |
| `404 Not Found` | Contenedor no encontrado |
| `503 Service Unavailable` | La API no está configurada del lado de EntregaX (contactar soporte) |

---

## 11. Ejemplos con `curl`

**Listar contenedores**
```bash
curl -H "X-ELP-Api-Key: TU_API_KEY_AQUI" \
  https://api.entregax.app/api/elp/containers
```

**Obtener documentos**
```bash
curl -H "X-ELP-Api-Key: TU_API_KEY_AQUI" \
  https://api.entregax.app/api/elp/containers/ONEU4343977/documents
```

**Enviar pulso de estatus**
```bash
curl -X POST \
  -H "X-ELP-Api-Key: TU_API_KEY_AQUI" \
  -H "Content-Type: application/json" \
  -d '{"status":"docs_received","notes":"Docs OK"}' \
  https://api.entregax.app/api/elp/containers/ONEU4343977/status
```

**Descargar el ZIP** (usar el `zip_url` recibido)
```bash
curl -L -o ONEU4343977_documentos.zip \
  "https://api.entregax.app/api/elp/containers/ONEU4343977/zip?token=..."
```

---

## 12. Ejemplo de integración (Node.js)

```javascript
const API_BASE = 'https://api.entregax.app';
const API_KEY  = process.env.ELP_API_KEY; // guardar en variable de entorno

const headers = { 'X-ELP-Api-Key': API_KEY };

// 1. Listar contenedores
async function listContainers() {
  const r = await fetch(`${API_BASE}/api/elp/containers`, { headers });
  return (await r.json()).containers;
}

// 2. Obtener documentos de un contenedor
async function getDocuments(containerNumber) {
  const r = await fetch(`${API_BASE}/api/elp/containers/${containerNumber}/documents`, { headers });
  return await r.json();
}

// 3. Enviar pulso de estatus
async function sendStatus(containerNumber, status, notes) {
  const r = await fetch(`${API_BASE}/api/elp/containers/${containerNumber}/status`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, notes }),
  });
  if (!r.ok) throw new Error(`Error ${r.status}: ${await r.text()}`);
  return await r.json();
}

// Ejemplo de uso
(async () => {
  const containers = await listContainers();
  const c = containers[0];
  const docs = await getDocuments(c.container_number);
  console.log('Documentos:', docs.documents);
  await sendStatus(c.container_number, 'docs_received', 'Documentación validada');
})();
```

---

## 13. Recomendaciones de seguridad

- Guarda la **API Key** en una variable de entorno / bóveda de secretos. **No** la pongas en código fuente ni la compartas por canales inseguros.
- Todo el tráfico es sobre **HTTPS**.
- Si sospechas que la API Key se comprometió, contacta a EntregaX para **rotarla** de inmediato.
- Las URLs de documentos son firmadas y temporales (7 días); trátalas como sensibles.

---

## 14. Resumen rápido (cheat sheet)

```
Base:  https://api.entregax.app
Auth:  X-ELP-Api-Key: <key>

GET   /api/elp/containers                          → lista de contenedores
GET   /api/elp/containers/{container}/documents    → URLs de documentos + zip_url
GET   /api/elp/containers/{container}/zip?token=…   → ZIP (link público del correo)
POST  /api/elp/containers/{container}/status         → PULSO DE ESTATUS
        body: { "status": "docs_received" | "procedure_requested"
                        | "cbp_signature_received" | "arrived_port",
                "notes": "opcional" }
```
