# Production image: install (with devDeps for tsc), compile, prune, run.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
# Install all deps so `typescript` is available for `npm run build`
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY openapi.yaml ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
# Railway sets PORT at runtime; default matches local dev
ENV PORT=8010

EXPOSE 8010
CMD ["node", "dist/server.js"]
