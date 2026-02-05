# Builder stage
FROM node:22-alpine AS builder

RUN npm install -g pnpm@10.11.0 turbo@latest
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml turbo.json package.json ./
COPY convex/package.json ./convex/
COPY firstdue-listener/package.json ./firstdue-listener/
RUN pnpm install --frozen-lockfile

COPY convex ./convex
COPY firstdue-listener ./firstdue-listener
RUN turbo run build --filter=@sizeupdashboard/firstdue-listener --cache-dir=.turbo

# Final stage
FROM node:22-alpine
RUN npm install -g pnpm@10.11.0
WORKDIR /app
RUN mkdir -p /app/logs

COPY --from=builder /app/convex ./convex
COPY --from=builder /app/firstdue-listener ./firstdue-listener
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/package.json ./package.json

RUN pnpm install --prod --frozen-lockfile
WORKDIR /app/firstdue-listener
EXPOSE 8080
CMD ["pnpm", "start"]
