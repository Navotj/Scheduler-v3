FROM node:22-alpine

WORKDIR /opt/app

# Install dependencies first
COPY backend/app/package*.json ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

# Copy source
COPY backend/app/ ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "app.js"]
