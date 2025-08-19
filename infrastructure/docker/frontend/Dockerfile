# Build static frontend
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/ /app/
RUN npm ci --omit=dev || npm install --omit=dev
RUN [ -f package.json ] && (npm run build || true) || true

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/dist/ /usr/share/nginx/html/
# Fallback if no build step: copy raw frontend dir
COPY --from=build /app/ /usr/share/nginx/html/
RUN rm -f /etc/nginx/conf.d/default.conf
COPY <<'CONF' /etc/nginx/conf.d/app.conf
server {
  listen 80 default_server;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  location / {
    try_files $uri /index.html;
  }
  location = /check { return 200 "ok\n"; }
}
CONF
