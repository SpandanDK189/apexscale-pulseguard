# Multi-stage build for Go Teleceptor Interceptor
FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY go.mod ./
COPY go.* ./
COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o interceptor .

FROM alpine:latest
RUN apk --no-cache add ca-certificates

WORKDIR /root/
COPY --from=builder /app/interceptor .
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 8080

CMD ["sh", "start.sh"]
