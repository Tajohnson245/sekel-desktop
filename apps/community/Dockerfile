FROM node:22-bookworm-slim AS pruner
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install -g turbo@2
COPY . .
RUN turbo prune @sekel/community --docker

FROM node:22-bookworm-slim AS installer
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN npm install

FROM node:22-bookworm-slim AS dev
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=development
RUN npm install -g turbo@2
COPY --from=installer /app/node_modules ./node_modules
CMD ["npm", "run", "dev", "-w", "@sekel/community"]
