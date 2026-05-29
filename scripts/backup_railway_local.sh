#!/bin/bash
# Daily Railway DB backup → ~/backups/entregax/
# Mantiene los últimos 14 días, borra los más viejos.

set -euo pipefail

PG_BIN="/Applications/Postgres.app/Contents/Versions/17/bin"
ENV_FILE="/Users/aldokmps/SOS-X-5/entregax-backend-api/.env"
BACKUP_DIR="/Users/aldokmps/backups/entregax"
LOG_FILE="/Users/aldokmps/backups/entregax/backup.log"
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"

DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
if [[ -z "$DATABASE_URL" ]]; then
  echo "[$(date)] ❌ DATABASE_URL no encontrada en $ENV_FILE" >> "$LOG_FILE"
  exit 1
fi

FILENAME="$BACKUP_DIR/entregax_$(date +'%Y-%m-%d_%H%M').sql.gz"
echo "[$(date)] Iniciando backup → $FILENAME" >> "$LOG_FILE"

if "$PG_BIN/pg_dump" "$DATABASE_URL" --no-owner --no-acl 2>>"$LOG_FILE" | gzip > "$FILENAME"; then
  SIZE=$(du -h "$FILENAME" | cut -f1)
  echo "[$(date)] ✅ Backup OK ($SIZE)" >> "$LOG_FILE"
else
  echo "[$(date)] ❌ Backup FAILED" >> "$LOG_FILE"
  rm -f "$FILENAME"
  exit 1
fi

# Limpieza: borra backups con más de $RETENTION_DAYS días
find "$BACKUP_DIR" -name 'entregax_*.sql.gz' -type f -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Limpieza completada (retención: $RETENTION_DAYS días)" >> "$LOG_FILE"
