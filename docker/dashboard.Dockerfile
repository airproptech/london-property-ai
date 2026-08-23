FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/dashboard/package.json apps/dashboard/package.json

RUN npm install --workspace=apps/dashboard

COPY apps/dashboard apps/dashboard

WORKDIR /app/apps/dashboard
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
