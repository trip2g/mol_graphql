// Mock GraphQL server: fixed schema + in-memory data.
// The codegen introspects server/schema.graphql (the same SDL file), the app calls this endpoint.
// Data + resolvers live in mock.mjs, shared with the in-browser Pages executor.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createYoga, createSchema } from 'graphql-yoga'
import { resolvers } from './mock.mjs'

const typeDefs = readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8')

const yoga = createYoga({
	schema: createSchema({ typeDefs, resolvers }),
	cors: { origin: '*', methods: ['POST', 'GET', 'OPTIONS'] },
	landingPage: false,
})

const port = process.env.PORT || 4000
createServer(yoga).listen(port, () => {
	console.log(`Mock GraphQL server: http://localhost:${port}/graphql`)
})
