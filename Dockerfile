FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o algocdk main.go

FROM alpine:latest

RUN apk --no-cache add ca-certificates sqlite-libs

WORKDIR /app

COPY --from=builder /app/algocdk .
COPY --from=builder /app/frontend ./frontend
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/swagger-ui ./swagger-ui

RUN mkdir -p uploads sites

EXPOSE 3000

CMD ["./algocdk"]
