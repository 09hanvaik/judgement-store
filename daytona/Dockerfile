# Minimal sandbox image. No dependencies: the service is one file on Node 20+.
FROM node:22-alpine
WORKDIR /app
COPY service.mjs ./
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "service.mjs"]
