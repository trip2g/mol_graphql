FROM node:24-alpine
WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev
COPY schema.graphql index.mjs ./
EXPOSE 4000
CMD ["node", "index.mjs"]
