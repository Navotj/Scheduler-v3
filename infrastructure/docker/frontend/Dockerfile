# syntax=docker/dockerfile:1.7

# --- Builder (optional Node build if package.json exists) ---
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

# --- Runtime (nginx) ---
FROM nginx:alpine AS runtime

# Replace default server and serve SPA with secure headers
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=builder /out/ /usr/share/nginx/html/

RUN set -eux; \
  cat > /etc/nginx/conf.d/site.conf <<'NGINX'
server {
  listen 80 default_server;
  server_name _;
  root /usr/share/nginx/html;

  # Basic security headers
  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options DENY always;
  add_header Referrer-Policy no-referrer-when-downgrade always;
  add_header X-XSS-Protection "1; mode=block" always;

  # Compression
  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

  # Cache static assets
  location ~* \.(?:js|css|png|jpg|jpeg|gif|svg|ico|webp)$ {
    expires 30d;
    access_log off;
    try_files $uri =404;
  }

  # SPA fallback
  location / {
    try_files $uri $uri/ /index.html;
  }
}
NGINX

HEALTHCHECK CMD wget -qO- http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
