FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/agent/package.json apps/agent/
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/

RUN npm install

COPY . .

RUN npm run build -w @cafe-project/database
RUN npm run generate -w @cafe-project/database
RUN npm run build -w @cafe-project/api

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app /app

EXPOSE 5000
CMD ["sh", "-c", "npx prisma db push --schema=packages/database/prisma/schema --skip-generate && npm run start -w @cafe-project/api"]
