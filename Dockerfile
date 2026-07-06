FROM node:20-alpine
RUN apk add --no-cache postgresql-client
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN chmod +x /app/docker-entrypoint.sh && test ! -f .env
EXPOSE 3000
USER node
ENTRYPOINT ["/app/docker-entrypoint.sh"]
