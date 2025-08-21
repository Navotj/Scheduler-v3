FROM nginxinc/nginx-unprivileged:1.27-alpine

USER root

# Copy static assets
COPY frontend/ /usr/share/nginx/html/

# Prepare dirs and drop default; make writable for uid/gid 101 (nginx user)
RUN rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p /etc/nginx/custom /docker-entrypoint.d \
    && chown -R 101:101 /etc/nginx /usr/share/nginx/html /docker-entrypoint.d

# Robust runtime renderer: ALWAYS write a valid server, never fail the container.
# If $api_host is set, a /api/ proxy is added; otherwise only static is served.
COPY --chown=101:101 --chmod=0755 <<'RENDER' /docker-entrypoint.d/30-render-site.sh
#!/usr/bin/env sh
set -u

echo "[render] uid=$(id -u) gid=$(id -g)" >&2
mkdir -p /etc/nginx/conf.d || true
# Basic static server; we may append an /api/ block below
cat > /etc/nginx/conf.d/site.conf <<'EOF'
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri /index.html;
  }
}
EOF

# If api_host provided, append proxy block
if [ -n "${api_host:-}" ]; then
  echo "[render] enabling /api/ proxy to ${api_host}" >&2
  cat >> /etc/nginx/conf.d/site.conf <<EOF

  # appended at runtime
  upstream api_upstream {
    server ${api_host}:443;
  }

  server {
    listen 8080;
    location /api/ {
      proxy_http_version 1.1;
      proxy_set_header Host ${api_host};
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_redirect off;
      proxy_ssl_server_name on;
      resolver 1.1.1.1 8.8.8.8 ipv6=off valid=300s;
      proxy_pass https://api_upstream;
    }
  }
EOF
else
  echo "[render] api_host not set; serving static only" >&2
fi

# Validate but NEVER crash the container on failure; log for visibility
if ! nginx -t; then
  echo "[render] nginx -t failed; resulting config:" >&2
  cat /etc/nginx/nginx.conf /etc/nginx/conf.d/site.conf 2>/dev/null >&2 || true
fi

exit 0
RENDER

USER 101:101

EXPOSE 8080
