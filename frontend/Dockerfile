# ── Build stage ──
FROM node:20-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# REACT_APP_BACKEND_URL can be injected at build time:
#   docker build --build-arg REACT_APP_BACKEND_URL=https://api.example.com .
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

ENV CI=false
RUN npm run build

# ── Runtime stage: serve with nginx ──
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/build /usr/share/nginx/html

# SPA fallback: all routes serve index.html
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    gzip on;\n\
    gzip_types text/plain text/css application/json application/javascript;\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
