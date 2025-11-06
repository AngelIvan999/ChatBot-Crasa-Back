# Etapa de construcción (instalar dependencias)
FROM node:21-alpine3.18 AS builder

WORKDIR /tmp

RUN corepack enable && corepack prepare pnpm@latest --activate
ENV PNPM_HOME=/usr/local/bin

COPY package*.json *-lock.yaml ./
RUN apk add --no-cache python3 make g++ git
RUN pnpm install
COPY . .

# Etapa final (deploy)
FROM node:21-alpine3.18 AS deploy

WORKDIR /tmp

ARG PORT=3000
ENV PORT=$PORT
EXPOSE $PORT

COPY --from=builder /tmp ./

RUN corepack enable && corepack prepare pnpm@latest --activate 
ENV PNPM_HOME=/usr/local/bin

RUN apk add --no-cache ttf-dejavu fontconfig

# Instala solo dependencias necesarias para producción
RUN npm cache clean --force && pnpm install --prod --ignore-scripts \
    && addgroup -g 1001 -S nodejs && adduser -S -u 1001 nodejs \
    && rm -rf $PNPM_HOME/.npm $PNPM_HOME/.node-gyp

USER nodejs

CMD ["node", "src/app.js"]
