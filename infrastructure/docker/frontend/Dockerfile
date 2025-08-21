FROM nginxinc/nginx-unprivileged:1.27-alpine

# Serve your static site
COPY frontend/ /usr/share/nginx/html/

# Nginx conf via envsubst at runtime
RUN rm -f /etc/nginx/conf.d/default.conf && mkdir -p /etc/nginx/templates
COPY <<'NGINX' /etc/nginx/templates/site.conf.template
server {
  listen 8080;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  # SPA routing (works fine for your pages too)
  location / {
    try_files $uri $uri/ /index.html;
  }

  # API proxy
  set $api_host ${API_HOST:-api.nat20scheduling.com};
  resolver ${RESOLVERS} valid=30s ipv6=off;

  proxy_ssl_server_name on;

  location /api/ {
    proxy_http_version 1.1;
    proxy_set_header Host $api_host;
    proxy_set_header Connection "";
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_redirect off;
    proxy_pass https://$api_host;
  }
}
NGINX
