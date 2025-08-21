FROM nginxinc/nginx-unprivileged:1.27-alpine

# Work as root for build-time file ops
USER root

# App static files
COPY frontend/ /usr/share/nginx/html/

# Prepare nginx config dirs and permissions for unprivileged runtime user (101)
RUN rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p /etc/nginx/custom /docker-entrypoint.d \
    && chown -R 101:101 /etc/nginx/conf.d /etc/nginx/custom /docker-entrypoint.d

# Templated site config (rendered at container start using envsubst)
COPY --chown=101:101 <<'NGINX' /etc/nginx/custom/site.conf.template
server {
  listen 8080;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  # Single page app routing
  location / {
    try_files $uri /index.html;
  }

  # Proxy API to external host provided by ${api_host}
  location /api/ {
    proxy_http_version 1.1;
    proxy_set_header Host ${api_host};
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_redirect off;
    proxy_ssl_server_name on;
    proxy_pass https://${api_host};
  }
}
NGINX

# Render only ${api_host} (preserve nginx runtime vars like $scheme)
COPY --chown=101:101 --chmod=0755 <<'RENDER' /docker-entrypoint.d/30-render-site.sh
#!/usr/bin/env sh
set -eu
: "${api_host:?api_host env var must be set}"
envsubst '${api_host}' < /etc/nginx/custom/site.conf.template > /etc/nginx/conf.d/site.conf
nginx -t
RENDER

# Drop back to the non-root user provided by the base image
USER 101:101

EXPOSE 8080
