# syntax=docker/dockerfile:1.7

# --- Builder ---
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

USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=builder /out/ /usr/share/nginx/html/

# NGINX config with reverse proxy to backend (same-origin /api -> https://api.nat20scheduling.com)
RUN set -eux; \
  cat > /etc/nginx/conf.d/site.conf <<'NGINX' && \
  chown 101:0 /etc/nginx/conf.d/site.conf
server {
  listen 8080 default_server;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options DENY always;
  add_header Referrer-Policy no-referrer-when-downgrade always;
  add_header X-XSS-Protection "1; mode=block" always;

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

  # Backend API (avoid CORS by proxying /api to backend ALB)
  location /api/ {
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host api.nat20scheduling.com;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_pass https://api.nat20scheduling.com/;
  }
}
NGINX

USER 101
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/index.html >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
