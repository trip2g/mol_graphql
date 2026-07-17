// FALLBACK in-browser GraphQL executor for the static GitHub Pages build
// (canonical path: the $demo_app_static module, app/static/static.ts).
// Same SDL (server/schema.graphql) and same data + resolvers (server/mock.mjs)
// as the real mock server - esbuild bundles them all into pages/dist/mock.js.
//
// Loaded AFTER web.js (which defines the global `$` namespace); installs
// itself as $demo_graphql_transport. Must stay synchronous: the app's fiber
// runtime ($mol_wire_sync style) expects the transport to return a value,
// hence graphqlSync - all resolvers here are sync anyway.
import { buildSchema, graphqlSync } from 'graphql'
import sdl from '../server/schema.graphql'
import { resolvers } from '../server/mock.mjs'

const schema = buildSchema(sdl)

// buildSchema produces a resolver-less schema; attach the server's resolver
// map onto it (same (source, args) signature as graphql-tools/yoga uses)
for (const [typeName, fields] of Object.entries(resolvers)) {
	const type = schema.getType(typeName)
	for (const [fieldName, resolve] of Object.entries(fields)) {
		type.getFields()[fieldName].resolve = resolve
	}
}

// the same { data, errors } shape the HTTP transport gets from the wire
$.$demo_graphql_transport = (query, variables) => {
	const res = graphqlSync({ schema, source: query, variableValues: variables })
	return {
		data: res.data,
		...res.errors && { errors: res.errors.map(err => ({ message: err.message, path: err.path })) },
	}
}
