# Build the $mol app: codegen (.graphql -> .graphql.ts) + mam build, then serve statically.
FROM node:24 AS build
WORKDIR /mam

COPY package.json ./
RUN npm install

# pre-fetch the $mol module namespaces (the mam builder would otherwise clone
# them on first build; see .meta.tree for the namespace -> repo mapping)
RUN git clone --depth 1 https://github.com/hyoo-ru/mam_mol.git mol \
 && git clone --depth 1 https://github.com/hyoo-ru/mam_node.git node

COPY .meta.tree tsconfig.json mam.ts mam.jam.js ./
COPY codegen ./codegen
COPY server/schema.graphql ./server/schema.graphql
COPY demo ./demo

# the seam: graphql-codegen writes *.graphql.ts, then the $mol builder compiles
# them as ordinary module .ts (type-checking the whole bundle along the way)
RUN npm run codegen
ENV MAM_PULL_DISABLED=1
RUN npx mam demo/app

FROM nginx:alpine
COPY --from=build /mam/demo/app/-/ /usr/share/nginx/html/
