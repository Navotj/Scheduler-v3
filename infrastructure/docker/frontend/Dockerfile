# ---------- builder ----------
FROM node:22-alpine AS builder
WORKDIR /work

# Copy your frontend source
COPY frontend/ /work/src/

# Build or copy static assets to /out
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

# ---------- runtime ----------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Clean default site and copy assets
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=builder /out/ /usr/share/nginx/html/

# Template NGINX site config (note the .template suffix)
# The nginx entrypoint will envsubst *.template -> *.conf
# We use a variable in proxy_pass so DNS is done at request-time,
# and use ${RESOLVERS} provided by 15-local-resolvers.envsh.
RUN set -eux; \
  cat > /etc/nginx/conf.d/site.conf.template <<'NGINX' && \
  chown 101:0 /etc/nginx/conf.d/site.conf.template
server {
  listen 8080;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  # Static files
  location = / {
    try_files /index.html =404;
  }
  location / {
    try_files $uri $uri/ /index.html;
  }

  # --- API proxy ---
  # Configure API host through env var; default keeps your current hostname.
  set $api_host ${API_HOST:-api.nat20scheduling.com};

  # Use cluster resolvers injected by the image's entrypoint (IPs from /etc/resolv.conf)
  resolver ${RESOLVERS} valid=30s ipv6=off;

  # If your API speaks HTTPS and needs SNI
  proxy_ssl_server_name on;

  # Forward /api/* as-is to the API host
  location /api/ {
    proxy_http_version 1.1;
    proxy_set_header Host $api_host;
    proxy_set_header Connection "";
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_redirect off;

    # IMPORTANT: variable in proxy_pass -> DNS is deferred to request-time
    proxy_pass https://$api_host;
  }
}
NGINX
