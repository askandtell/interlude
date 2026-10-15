FROM node:24.15.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24.15.0-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=18080
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/build ./build
USER node
EXPOSE 18080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:18080/api/health').then(async r=>{const h=await r.json();process.exit(h.status==='ready'?0:1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]
