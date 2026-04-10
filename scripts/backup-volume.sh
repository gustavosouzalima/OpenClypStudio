#!/usr/bin/env bash
# Backup do volume openclyp_data
# Uso: ./scripts/backup-volume.sh [destino]
# Se destino nao for informado, cria ./backups/openclyp_data_<data>.tar.gz

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEST="$BACKUP_DIR/openclyp_data_${TIMESTAMP}.tar.gz"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.openclyp.yml}"

mkdir -p "$BACKUP_DIR"

# Cria container temporario para acessar o volume e faz tar
docker compose -f "$COMPOSE_FILE" run --rm \
  -v "$(pwd)/$BACKUP_DIR:/backup" \
  --entrypoint "" \
  --no-deps backend \
  tar czf "/backup/openclyp_data_${TIMESTAMP}.tar.gz" /data

echo "Backup criado: $DEST"
echo "Para restaurar:"
echo "  docker compose -f $COMPOSE_FILE run --rm -v \$(pwd)/backups:/backup --entrypoint '' --no-deps backend tar xzf /backup/openclyp_data_${TIMESTAMP}.tar.gz -C /"
