FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/internal-web/package.json apps/internal-web/package.json
COPY apps/public-web/package.json apps/public-web/package.json
COPY services/auth-service/package.json services/auth-service/package.json
COPY services/business-api/package.json services/business-api/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/api-contracts/package.json packages/api-contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY database/package.json database/package.json
RUN npm install --global npm@11.21.1 && npm ci
COPY . .
RUN npm run build

FROM build AS dependencies
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY --from=dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/package.json ./package.json
COPY --from=build --chown=node:node /workspace/packages ./packages
COPY --from=build --chown=node:node /workspace/database ./database
COPY --from=build --chown=node:node /workspace/services ./services
USER node
ENV NODE_ENV=production
CMD ["node", "services/business-api/dist/main.js"]

FROM nginx:stable-alpine AS public-web
COPY --from=build /workspace/apps/public-web/dist /usr/share/nginx/html
COPY deploy/public/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/headers.conf /etc/nginx/aq-headers.conf

FROM nginx:stable-alpine AS internal-web
COPY --from=build /workspace/apps/internal-web/dist /usr/share/nginx/html
COPY deploy/internal/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/headers.conf /etc/nginx/aq-headers.conf
