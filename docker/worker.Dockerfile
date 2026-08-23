FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/lead-scoring/package.json packages/lead-scoring/package.json
COPY packages/property-matching/package.json packages/property-matching/package.json
COPY packages/communications/package.json packages/communications/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm install --workspaces --if-present

COPY tsconfig.base.json ./
COPY apps/worker apps/worker
COPY packages packages

RUN npm run build --workspace=apps/worker

WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
