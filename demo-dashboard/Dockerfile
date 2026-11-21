# Build step
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Serve with Caddy (lightweight, zero-config, native $PORT support)
FROM caddy:alpine
COPY --from=build /app/dist /usr/share/caddy
EXPOSE 8080
CMD ["caddy", "file-server", "--root", "/usr/share/caddy", "--listen", ":8080"]
