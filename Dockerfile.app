# Build the $mol app the canonical way: a central mam workspace (hyoo-ru/mam,
# provides the mam.ts/tsconfig bootstrap) with this repo mounted as its
# `demo` package — same shape as hyoo-ru/mam_build does in CI. Then serve
# the bundle statically.
FROM node:24 AS build
WORKDIR /mam
RUN git clone --depth 1 https://github.com/hyoo-ru/mam.git . \
 && git clone --depth 1 https://github.com/hyoo-ru/mam_mol.git mol \
 && git clone --depth 1 https://github.com/hyoo-ru/mam_node.git node \
 && npm install

# this repo = the workspace's demo/ package ($demo_app lives at demo/app)
COPY . ./demo

# the seam: graphql-codegen writes *.graphql.ts, then the $mol builder compiles
# them as ordinary module .ts (type-checking the whole bundle along the way)
RUN cd demo && npm install && npm run codegen
ENV MAM_PULL_DISABLED=1
RUN npx mam demo/app

FROM nginx:alpine
COPY --from=build /mam/demo/app/-/ /usr/share/nginx/html/
