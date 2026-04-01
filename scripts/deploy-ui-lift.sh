#!/bin/bash
set -e

cd /Users/jarvis/.openclaw/workspace/trailblaize-space

echo "=== Building..."
npm run build

echo "=== Committing..."
git add -A
git commit -m "refactor: UI consistency pass — white cards, clean typography, standardized pills/buttons across all nucleus pages"

echo "=== Pushing..."
git push origin main

echo "=== Done!"
