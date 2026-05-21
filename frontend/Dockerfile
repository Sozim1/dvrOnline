FROM node:20-bookworm-slim AS build

ARG VITE_API_URL=
ARG VITE_WEBRTC_URL=
ARG VITE_WEBRTC_PORT=8889
ARG VITE_WEBRTC_MUTED=true
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WEBRTC_URL=$VITE_WEBRTC_URL
ENV VITE_WEBRTC_PORT=$VITE_WEBRTC_PORT
ENV VITE_WEBRTC_MUTED=$VITE_WEBRTC_MUTED

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
