// GraphQL codegen config: .graphql files co-located with $mol components
// → per-file <name>.graphql.ts typed wrappers in `namespace $`.
//
// Schema comes from the checked-in SDL file (no live introspection needed):
// the build never depends on a running server.
module.exports = {
	schema: 'server/schema.graphql',
	documents: 'demo/**/*.graphql',
	generates: {
		'demo/': {
			preset: require('./preset.js'),
			plugins: [], // per-file plugin chains are built by the preset
			config: {
				// runtime module prefix: $demo_graphql_request / $demo_graphql_ref live in demo/graphql/
				molRuntime: '$demo_graphql',
				// keep authored GraphQL names in generated type names:
				// query DemoAppNotes -> DemoAppNotesQuery, fragment DemoNoteCard_note -> DemoNoteCard_noteFragment
				namingConvention: 'keep',
				// Relay-style fragment masking: a spread field is typed as an opaque
				// fragment ref, not inlined fields
				inlineFragmentTypes: 'mask',
			},
		},
	},
}
