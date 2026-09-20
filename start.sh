#!/usr/bin/env bash
# Run this to start AI Studio and open the Shorts generator.
# macOS/Linux equivalent of start.bat.
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies the first time - this can take a minute..."
  npm install
fi

if [ ! -f .env ]; then
  echo "Creating .env from .env.example - open it and add your API keys, or use the"
  echo "Settings panel on the Shorts page instead."
  cp .env.example .env
fi

echo "Starting AI Studio..."
(npm run dev &)
sleep 6
( xdg-open http://localhost:3000/shorts 2>/dev/null || open http://localhost:3000/shorts 2>/dev/null || true )
