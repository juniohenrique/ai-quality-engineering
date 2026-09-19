FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json eslint.config.js .prettierrc.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY public ./public
COPY migrations ./migrations
COPY scripts/migrate.js ./scripts/migrate.js

EXPOSE 3000
CMD ["sh", "-c", "npm run migrate:up && npm start"]
