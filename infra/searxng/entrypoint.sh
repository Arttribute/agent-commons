#!/bin/sh
set -eu

original=/usr/local/searxng/entrypoint.original.sh
patched=/tmp/searxng-entrypoint.sh

sed 's/searx\\.webapp:app/auth_middleware:app/' "$original" > "$patched"
chmod +x "$patched"
exec "$patched"
