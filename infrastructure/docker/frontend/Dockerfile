# Static site served by unprivileged NGINX. The CI builds from repo root.
FROM nginxinc/nginx-unprivileged:1.27-alpine

# App assets
COPY frontend/ /usr/share/nginx/html/

# Remove default site, add template + render hook
RUN rm -f /etc/nginx/conf.d/default.conf && mkdir -p /etc/nginx/custom /docker-entrypoint.d

# NGINX site template (uses $api_host if provided)
COPY --chown=101:101 --chmod=0644 <<'NGINX' /etc/nginx/custom/site.conf.template
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;

    # Example API proxy (adjust/remove as needed)
    location /api/ {
        proxy_pass https://$api_host$request_uri;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri /index.html;
    }
}
NGINX

# Render template into conf.d at runtime using provided env
COPY --chown=101:101 --chmod=0755 <<'RENDER' /docker-entrypoint.d/30-render-site.sh
#!/bin/sh
set -eu
tmpl="/etc/nginx/custom/site.conf.template"
out="/etc/nginx/conf.d/site.conf"

# Replace $api_host placeholder if env provided
if [ -n "${api_host:-}" ]; then
  sed "s/\$api_host/${api_host}/g" "$tmpl" > "$out"
else
  cp "$tmpl" "$out"
fi

nginx -t
RENDER

USER 101:101
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
