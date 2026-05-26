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

## Notas importantes

⚠️ **Siempre haz un backup antes de ejecutar migraciones en producción:**
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

⚠️ **Verifica que la migración usa `IF NOT EXISTS` o `IF EXISTS`** para ser idempotente (se puede ejecutar múltiples veces sin errores).
