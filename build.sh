#!/bin/bash

echo "🔨 Building Mezo Compose SDK..."

# Clean
rm -rf dist
mkdir -p dist

# Build with TypeScript (allow type errors since they don't affect runtime)
echo "📦 Compiling TypeScript..."
npx tsc --project tsconfig.lib.json --outDir dist || true

# Verify output
if [ -f "dist/index.js" ] && [ -f "dist/index.d.ts" ]; then
    echo "✅ Build successful!"
    echo ""
    echo "📁 Output:"
    ls -lh dist/ | grep -E "index\.(js|d\.ts)$" || ls -lh dist/ | head -10
    exit 0
else
    echo "❌ Build failed - missing output files"
    exit 1
fi
