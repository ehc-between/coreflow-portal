# CoreFlow portal — production image (static Angular build served by nginx).
# The browser calls the API same-origin on /api; the load balancer routes /api/* to
# the API service, so this image needs no API URL baked in.
ARG REGISTRY=public.ecr.aws/docker/library

FROM ${REGISTRY}/node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx ng build --configuration production

FROM ${REGISTRY}/nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/coreflow-portal/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
