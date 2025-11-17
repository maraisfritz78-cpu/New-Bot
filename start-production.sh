#!/bin/bash

# Production startup with optimized GC for 24/7 operation
export NODE_ENV=production
export NODE_OPTIONS="
  --max-old-space-size=4096
  --expose-gc
  --trace-gc
  --gc-interval=15000
"

# Build if needed
if [ ! -d ".next" ]; then
  echo "Building Next.js..."
  npm run build
fi

# Start with PM2
echo "Starting bot with PM2..."
npm run start:pm2

# Display status
pm2 status
pm2 logs
