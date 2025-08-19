# syntax=docker/dockerfile:1.7

# --- Builder (unchanged) ---
FROM node:22-alpine AS builder
WORKDIR /work
COPY frontend/ /work/src/
RUN set -eux; \
    if [ -f /work/src/package.json ]; then \
      cd /work/src; \
      if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi; \
      npm run build || npm run build:prod || npm run build:production || true; \
      if [ -d dist ]; then cp -r dist /out; \
      elif [ -d build ]; then cp -r build /out; \
      elif [ -d public ]; then cp -r public /out; \
      else mkdir -p /out && cp -r ./* /out; fi; \
    else \
      mkdir -p /out && cp -r /work/src/* /out; \
    fi

# --- Runtime (nginx, unprivileged) ---
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Replace default server, listen on 8080 (non-root)
USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=builder /out/ /usr/share/nginx/html/
RUN set -eux; \
  cat > /etc/nginx/conf.d/site.conf <<'NGINX'
server {
  listen 8080 default_server;
  server_name _;
  root /usr/share/nginx/html;

  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options DENY always;
  add_header Referrer-Policy no-referrer-when-downgrade always;
  add_header X-XSS-Protection "1; mode=block" always;

  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

  location ~* \.(?:js|css|png|jpg|jpeg|gif|svg|ico|webp)$ {
    expires 30d;
    access_log off;
    try_files $uri =404;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
NGINX
USER 101

HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
