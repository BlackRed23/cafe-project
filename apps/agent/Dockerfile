FROM node:24.22.3-alpine3.23@sha256:3946fb783fdce8a2812136ea694bc95c698c4f4096f3fd18568dc27a8ac389dc AS toolchain
RUN test "$(node --version)" = "v24.22.3" \
    && npm install --global npm@11.6.2 \
    && test "$(npm --version)" = "11.6.2"

FROM toolchain AS builder
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

RUN apk add --no-cache openssl
RUN npm ci

COPY . .

RUN npm run build -w @cafe-project/database
RUN npm run build -w @cafe-project/agent

FROM toolchain AS runner
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=builder /app /app

EXPOSE 5055
CMD ["npm", "run", "start:server", "-w", "@cafe-project/agent"]
