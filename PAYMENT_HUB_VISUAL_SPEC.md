# 🎨 Payment Hub - Especificación Visual & Diseño

## 1. ARQUITECTURA VISUAL GENERAL

```
┌─────────────────────────────────────────────────────────────┐
│  🔒 Hub de Pagos Seguros                                   │
│  Dispersión de fondos internacionales | PCI | SSL | Nivel  │
│                                                              │
│  [🟢 Certificado PCI] [🔒 Encriptado] [🏦 Nivel Bancario] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📊 DASHBOARD (4 Dark Cards en Grid)                        │
│  ┌──────────────┬──────────────┬──────────────┬────────────┐
│  │ 💵 Total     │ ✈️ Pendientes│ ⚓ Marítimos│ 📈 Comisiones│
│  │             │ Aéreos       │             │ Asesores   │
│  │ $145,250.75 │ $45,200.00   │ $89,300.50  │ $10,750.25 │
│  │ USD         │ USD          │ USD         │ USD        │
│  └──────────────┴──────────────┴──────────────┴────────────┘
│
│  📋 TABLA DE DISPERSIÓN (Dark Mode)
│  ┌──────────────────────────────────────────────────────────┐
│  │ ☑  Proveedor │ UUID │ Monto │ Vto │ Cuenta │ Estado │ Acción
│  ├──────────────────────────────────────────────────────────┤
│  │ ☐  Provider A │ 550e │ $15.5k│ 05/5│ ****67 │ ⏱Pending│ [SPEI]
│  │ ☐  Provider B │ 550e │ $28.7k│ 05/8│ ES91..│ ✅ Apr  │ ⋮
│  │ ☑  IntlCorp   │ 550e │ $42.1k│ 05/10│ SWIFT│ ⚙️ Process│ ⋮
│  │ ☐  LogistPart │ 550e │ $35.4k│ 05/12│ ****01 │ ✅ Done│ ⋮
│  └──────────────────────────────────────────────────────────┘
│
└─────────────────────────────────────────────────────────────┘

FONDO: #000000 (Negro puro)
BORDERS: #333333 (Gris oscuro)
ACENTOS: #F05A28 (Naranja)
TEXTO: #ffffff (Blanco)
```

---

## 2. COMPONENTES DETALLADOS

### 2.1 DarkCard Component

```
┌─────────────────────────────────┐
│ 💵 TOTAL POR PAGAR              │  ← Ícono + Label
│                                 │
│ $145,250.75                     │  ← Valor grande en Naranja
│                                 │
│ Total de operaciones pendientes │  ← Subtitle (opcional)
│                                 │
│ Border: 1px #333333             │
│ Bg: #1a1a1a                     │
│ Hover: Border #F05A28 + shadow  │
└─────────────────────────────────┘

Tipografía:
- Label: Caption, #888888, UPPERCASE, 0.75rem
- Valor: H4, #F05A28 (primary), 2.5rem, fontWeight 700
- Subtitle: Body2, #aaaaaa, 0.875rem
```

### 2.2 DashboardMetrics Container

```
Usaría CSS Grid:
display: grid
gridTemplateColumns: repeat(auto-fit, minmax(250px, 1fr))
gap: 2

Responsive:
- Mobile: 1 columna
- Tablet: 2 columnas
- Desktop: 4 columnas
```

### 2.3 PaymentDispersalTable

```
HEADER ROW:
┌────┬──────────┬────────┬────────┬───────┬──────────┬────────┬────────┐
│ ☑  │ PROVEEDOR│ UUID   │ MONTO │ VTO │ CUENTA  │ ESTATUS │ ACCIÓN │
│    │          │        │       │     │         │        │        │
└────┴──────────┴────────┴────────┴───────┴──────────┴────────┴────────┘
Color: #0a0a0a background
Text: #888888, uppercase, 0.75rem, fontWeight 600

DATA ROWS:
┌────┬──────────────┬────────────┬────────┬───────┬──────┬──────────┬────────┐
│ ☑  │ Proveedor A  │ 550e8400.. │ $15.5k│05/05 │****67│ ⏱Pending │ [SPEI] │
│    │ RFC: PRV001  │            │       │      │      │          │        │
│    │ Alias: Prov1 │            │       │      │      │          │        │
└────┴──────────────┴────────────┴────────┴───────┴──────┴──────────┴────────┘

Row BG: #1a1a1a
Row BG (selected): #1a2a3a
Row BG (hover): #242424
Border: 1px #2a2a2a

ESTADOS:
- Pending:    ⏱ #facc15 en #1a1700 con border #facc15
- Approved:   ✅ #4ade80 en #001a00 con border #4ade80
- Processing: ⚙️ #3b82f6 en #000a1a con border #3b82f6
- Completed:  ✓ #22c55e en #001a00 con border #22c55e
- Failed:     ❌ #ef4444 en #1a0000 con border #ef4444
```

### 2.4 SecurePaymentHeader

```
┌──────────────────────────────────────────────┐
│ 🔒 Hub de Pagos Seguros                    │
│ Dispersión de fondos | Certificado PCI | SSL│
│                                              │
│ [🟢 PCI DSS Cert][🔒 SSL/TLS Enc][🏦 Bank] │
└──────────────────────────────────────────────┘

Header Font:
- Título: H4, #ffffff, fontWeight 700
- Subtitle: Body2, #888888, monospace, 0.875rem

Badges:
- Bg: color-specific oscuro (e.g., #001a00 para verde)
- Border: 1px del color principal
- Icon: Color principal (e.g., #22c55e)
- Text: Color principal, fontWeight 600, 0.75rem
```

---

## 3. PALETA DE COLORES COMPLETA

```
GRISES (Dark Mode Base)
#000000 ······· Negro puro (fondo principal)
#0a0a0a ······· Gris ultra oscuro (headers de tabla)
#1a1a1a ······· Gris oscuro (cards, paneles)
#2a2a2a ······· Gris oscuro medio (borders, separadores)
#333333 ······· Gris oscuro claro (borders principales)
#888888 ······· Gris medio (labels, texto secundario)
#aaaaaa ······· Gris claro (hints, detalles)
#ffffff ······· Blanco (texto principal)

COLORES FUNCIONALES
#F05A28 ······· Naranja corporativo (acciones principales, valores importantes)
#4ade80 ······· Verde éxito (estados completados, aprobados)
#facc15 ······· Amarillo alerta (estados pendientes)
#3b82f6 ······· Azul info (estados procesando)
#22c55e ······· Verde claro (éxito completado)
#ef4444 ······· Rojo error (fallos)

COLORES BACKGROUND (Estados)
#001a00 ······· Verde oscuro (bg para estados verdes)
#1a1700 ······· Amarillo oscuro (bg para estados amarillos)
#000a1a ······· Azul oscuro (bg para estados azules)
#1a0000 ······· Rojo oscuro (bg para estados rojos)
#1a2a3a ······· Azul gris (rows seleccionadas)
```

---

## 4. TIPOGRAFÍA

```
Familia: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif

JERARQUÍA

H4 (32px, fontWeight 700)
└─ Título de métricas, título de página

H6 (20px, fontWeight 700)
└─ Subtítulos de secciones ("Dashboard", "Tabla de Dispersión")

Body1 (16px)
└─ Texto general de filas de tabla

Body2 (14px)
└─ Subtítulos, información complementaria

Caption (12px)
└─ Labels de headers, hints

Monospace (0.875rem)
└─ UUIDs, números de cuenta (fuente monoespaciada)
```

---

## 5. ESPACIADO (Padding/Margin)

```
Base: 8px

Utilizados:
- p: 2 ········ 16px (padding interior de cards)
- mb: 2 ······· 16px (margin bottom)
- mb: 3 ······· 24px (margin bottom de secciones)
- mb: 4 ······· 32px (margin bottom de componentes mayores)
- gap: 1 ······ 8px (gap pequeño)
- gap: 2 ······ 16px (gap estándar)
- px: 1.5 ··· 12px (padding horizontal botones)
- py: 0.75 ·· 6px (padding vertical botones)
```

---

## 6. BORDES Y ESQUINAS

```
Border Radius:
- borderRadius: 1 ····· 4px (inputs, chips)
- borderRadius: 2 ····· 8px (cards principales)

Border Style:
- 1px solid #333333 ··· Borders principales
- 1px solid #2a2a2a ··· Row separators
- 1px solid [color] ··· Status chips (dinámico)
```

---

## 7. ESTADOS DE INTERACCIÓN

### Hover (Cards)
```css
borderColor: #F05A28
boxShadow: 0 0 20px rgba(240, 90, 40, 0.2)
transform: translateY(-2px)
transition: all 0.3s ease
```

### Hover (Rows)
```css
backgroundColor: #242424
transition: all 0.2s ease
```

### Hover (Botones Naranja)
```css
backgroundColor: #e04917 (darker naranja)
```

### Checked (Checkbox)
```css
color: #F05A28 !important
```

### Active (Tabs)
```css
color: #F05A28
borderBottom: 2px solid #F05A28
```

---

## 8. SOMBRAS & ELEVACIÓN

```
Minimal shadows para dark mode:

Card Hover:
boxShadow: '0 0 20px rgba(240, 90, 40, 0.2)'

Menu Paper:
boxShadow: none (usa border en su lugar)

General pattern:
- Minimizar sombras en dark mode
- Usar bordes y colores para definición
```

---

## 9. RESPONSIVE BREAKPOINTS

```
XS: 0px - 600px (Mobile)
├─ 1 column grid
├─ Full width padding
└─ Tamaño fuente reducido

SM: 600px - 900px (Tablet Portrait)
├─ 2 column grid
├─ Padding moderate
└─ Tamaño fuente normal

MD: 900px - 1200px (Tablet Landscape)
├─ 3 column grid
├─ Padding normal
└─ Full tipografía

LG: 1200px+ (Desktop)
├─ 4 column grid
├─ Padding generous
└─ Estilos completos
```

---

## 10. ANIMACIONES

```
Transiciones suaves:
- transition: 'all 0.3s ease' (componentes)
- transition: 'all 0.2s ease' (interacciones rápidas)

Timing Functions:
- ease: Más natural y suave
- ease-in-out: Para movimientos de entrada/salida
```

---

## 11. EJEMPLOS DE COMPOSICIÓN

### Full Dark Card Hover
```
Antes:
┌─────────────────┐
│ 💵 Total        │ Border: #333333
│ $145,250        │ BG: #1a1a1a
│ por pagar       │ Text: #ffffff
└─────────────────┘

Después (Hover):
┌─────────────────┐
│ 💵 Total        │ Border: #F05A28 ✨
│ $145,250        │ BG: #1a1a1a
│ por pagar       │ Shadow: rgba(240,90,40,0.2) ✨
└─────────────────┘
  ↑ Elevación 2px
```

### Status Badge Styling
```
Pending:
┌─────────────────────┐
│ ⏱ Pendiente        │ BG: #1a1700
│                     │ Border: 1px #facc15
│                     │ Text: #facc15
└─────────────────────┘

Completed:
┌─────────────────────┐
│ ✓ Completado       │ BG: #001a00
│                     │ Border: 1px #22c55e
│                     │ Text: #22c55e
└─────────────────────┘
```

---

## 12. EXPORTACIÓN PARA DISEÑADORES

Cuando compartas con Figma/Adobe XD:

```
Componentes a exportar:
✓ DarkCard (con 5 variantes de color)
✓ Dashboard Grid (4 cards + spacing)
✓ Table Header Row
✓ Table Data Row (5 status variants)
✓ Status Badge (5 estados)
✓ Secure Header (con 3 badges)
✓ Orange Button (default + hover)
✓ Checkbox (checked + unchecked)

Estilos globales:
✓ Tipografía completa
✓ Paleta de colores
✓ Espaciado base
✓ Border radius
✓ Sombras
```

---

Este documento proporciona la especificación completa para implementar
o escalar el Payment Hub visualmente. ¡Listo para producción! 🚀
