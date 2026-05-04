FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_DATA_BASE_URL=
ARG VITE_GEOIP_ENDPOINT=
ENV VITE_DATA_BASE_URL=$VITE_DATA_BASE_URL
ENV VITE_GEOIP_ENDPOINT=$VITE_GEOIP_ENDPOINT
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
