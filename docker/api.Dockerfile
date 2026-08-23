FROM node:20-alpine AS base
WORKDIR /app

# Install deps at the workspace root so internal packages resolve correctly
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/lead-scoring/package.json packages/lead-scoring/package.json
COPY packages/property-matching/package.json packages/property-matching/package.json
COPY packages/communications/package.json packages/communications/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm install --workspaces --if-present

COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages packages

RUN npm run build --workspace=apps/api

WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
