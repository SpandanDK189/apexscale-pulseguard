# Stage 1: Build Vite frontend
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve using standard Python 3
FROM python:3.12-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY serve.py .

EXPOSE 8080
ENV PORT=8080

CMD ["python", "serve.py"]
