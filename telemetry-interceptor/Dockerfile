# Multi-stage build for Go Telemetry Interceptor
FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY go.mod ./
COPY go.* ./
COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /interceptor .

FROM alpine:latest
RUN apk --no-cache add ca-certificates libc6-compat

WORKDIR /app
COPY --from=builder /interceptor /app/interceptor
RUN chmod +x /app/interceptor

EXPOSE 8080

ENTRYPOINT ["/app/interceptor"]
