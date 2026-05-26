# Migraciones de Base de Datos

Este directorio contiene las migraciones SQL para la base de datos de EntregaX.

## Cómo ejecutar una migración

### Desarrollo local
```bash
psql -U postgres -d entregax_dev -f migrations/YYYY-MM-DD_nombre_migracion.sql
```

### Producción
```bash
# Asegúrate de tener la variable DATABASE_URL configurada
psql $DATABASE_URL -f migrations/YYYY-MM-DD_nombre_migracion.sql
```

### Verificar que se aplicó correctamente
```bash
psql $DATABASE_URL -c "\d users" | grep fiscal
```

## Migraciones disponibles

### 2026-05-26: Columnas fiscales en users
**Archivo:** `2026-05-26_add_fiscal_columns_to_users.sql`

**Descripción:** Agrega columnas para almacenar datos fiscales del cliente (RFC, régimen fiscal, CP, uso CFDI, razón social). Estos datos se guardan cuando el usuario solicita factura al hacer un pago, y se usan para pre-llenar el formulario de facturación en "Pendientes por Timbrar".

**Columnas agregadas:**
- `fiscal_rfc` - RFC del cliente
- `fiscal_razon_social` - Razón social
- `fiscal_regimen_fiscal` - Régimen fiscal (ej: 601, 616)
- `fiscal_codigo_postal` - Código postal del domicilio fiscal
- `fiscal_uso_cfdi` - Uso de CFDI (ej: G03, S01)

**Impacto:** Permite que los datos fiscales se mantengan entre pagos, mejorando la experiencia del usuario al no tener que re-ingresar su RFC cada vez.

**Reversión:** Si necesitas revertir:
```sql
ALTER TABLE users 
  DROP COLUMN IF EXISTS fiscal_rfc,
  DROP COLUMN IF EXISTS fiscal_razon_social,
  DROP COLUMN IF EXISTS fiscal_regimen_fiscal,
  DROP COLUMN IF EXISTS fiscal_codigo_postal,
  DROP COLUMN IF EXISTS fiscal_uso_cfdi;
DROP INDEX IF EXISTS idx_users_fiscal_rfc;
```

## Notas importantes

⚠️ **Siempre haz un backup antes de ejecutar migraciones en producción:**
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

⚠️ **Verifica que la migración usa `IF NOT EXISTS` o `IF EXISTS`** para ser idempotente (se puede ejecutar múltiples veces sin errores).
