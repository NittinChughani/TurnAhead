FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY public/ ./public/
COPY lib/ ./lib/
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV NODE_ENV=production DATA_DIR=/app/data PORT=3000
EXPOSE 3000
VOLUME /app/data
CMD ["node", "server.js"]