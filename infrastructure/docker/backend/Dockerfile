FROM node:22-alpine
WORKDIR /opt/app
COPY backend/app/ /opt/app/
RUN npm ci --omit=dev || npm install --omit=dev
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node","/opt/app/app.js"]