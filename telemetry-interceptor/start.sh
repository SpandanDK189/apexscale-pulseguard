#!/bin/sh
set -e

PORT="${PORT:-8080}"
echo "Starting PulseGuard Interceptor on port ${PORT}..."
exec ./interceptor
