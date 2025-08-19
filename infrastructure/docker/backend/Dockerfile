FROM node:22-alpine

WORKDIR /opt/app

# Install deps first for better layer caching
COPY backend/app/package*.json ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

# Copy application source
COPY backend/app/ ./

# Adjust if your start script differs
CMD ["npm","start"]
