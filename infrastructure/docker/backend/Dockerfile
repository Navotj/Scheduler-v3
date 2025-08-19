FROM node:22-alpine

WORKDIR /opt/app

# Install dependencies first (silences npm ci error if lockfile is missing)
COPY backend/app/package*.json ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

# Copy application source
COPY backend/app/ ./

CMD ["npm","start"]
