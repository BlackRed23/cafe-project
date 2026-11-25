FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/agent/package.json apps/agent/
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/
COPY packages/types/package.json packages/types/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY .npmrc ./

RUN npm ci

COPY . .

RUN npm run build -- --filter=@cafe-project/api

FROM node:24-alpine AS runner
WORKDIR /app
COPY --from=builder /app /app

EXPOSE 5000
CMD ["sh", "-c", "npx prisma migrate deploy --schema=packages/database/prisma/schema && npm run start -w @cafe-project/api"]
