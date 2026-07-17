// GraphQL codegen config: .graphql files co-located with $mol components
// → per-file <name>.graphql.ts typed wrappers in `namespace $`.
//
// Schema comes from the checked-in SDL file (no live introspection needed):
// the build never depends on a running server.
module.exports = {
	schema: 'server/schema.graphql',
	documents: ['app/**/*.graphql', 'note/**/*.graphql'],
	generates: {
		'./': {
			preset: require('./preset.js'),
			plugins: [], // per-file plugin chains are built by the preset
			config: {
				// this repo is the `demo` package of a mam workspace: repo-relative
				// app/notes.graphql is workspace demo/app/notes.graphql = $demo_app_notes
				molPackage: 'demo',
				// runtime module prefix: $demo_graphql_request / $demo_graphql_ref live in graphql/
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
