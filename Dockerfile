FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js database.js simulated-market.js market-query.js chart-domain.js chart-workspace-api.js ./
COPY services ./services
COPY public ./public
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "server.js"]
