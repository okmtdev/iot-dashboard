FROM node:22-slim

# ネットワークスキャンに使うツール（ping / ip コマンド）
RUN apt-get update \
  && apt-get install -y --no-install-recommends iputils-ping iproute2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY web ./web

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "server/index.js"]
