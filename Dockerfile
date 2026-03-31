FROM golang:1.24-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o algocdk main.go

FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /app/algocdk .
COPY --from=builder /app/frontend ./frontend
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/swagger-ui ./swagger-ui

RUN mkdir -p uploads sites && \
    adduser -D -u 1001 appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 3000

CMD ["./algocdk"]
