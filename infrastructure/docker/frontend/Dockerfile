FROM nginxinc/nginx-unprivileged:1.27-alpine

# Build-time ops as root
USER root

# Static assets
COPY frontend/ /usr/share/nginx/html/

# Prepare nginx layout and entrypoint dir
RUN rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p /etc/nginx/custom /docker-entrypoint.d \
    && chown -R 101:101 /etc/nginx /usr/share/nginx/html /docker-entrypoint.d

# Runtime render without envsubst (avoids missing binary in base image)
# Writes the site config using shell variable expansion only.
COPY --chown=101:101 --chmod=0755 <<'RENDER' /docker-entrypoint.d/30-render-site.sh
#!/usr/bin/env sh
set -eu
: "${api_host:?api_host env var must be set}"

# Ensure target dir exists (with emptyDir mount it will be)
mkdir -p /etc/nginx/conf.d

cat > /etc/nginx/conf.d/site.conf <<EOF
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files \$uri /index.html;
  }

  # Proxy API to external host provided by \${api_host}
  location /api/ {
    proxy_http_version 1.1;
    proxy_set_header Host ${api_host};
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_redirect off;
    proxy_ssl_server_name on;
    proxy_pass https://${api_host};
  }
}
EOF

# Validate config
nginx -t
RENDER

# Drop to non-root (uid/gid 101 provided by base image)
USER 101:101

EXPOSE 8080
