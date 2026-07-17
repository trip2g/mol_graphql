// GraphQL codegen config: .graphql files co-located with $mol components
// → per-file <name>.graphql.ts typed wrappers in `namespace $`.
//
// Schema comes from the checked-in SDL file (no live introspection needed):
// the build never depends on a running server.
//
// `revalidation` picks the compile-time invalidation mode baked into the
// wrappers: 'all' (refetch everything - this demo's default) | 'by_typenames'
// (per-type markers from a static schema walk) | 'disable' (never refetch).
// See codegen/molplugin.js and the README section on `revalidation`.

const base = {
	// this repo is the `demo` package of a mam workspace: repo-relative
	// app/notes.graphql is workspace demo/app/notes.graphql = $demo_app_notes
	molPackage: 'demo',
	// runtime module prefix: $demo_graphql_request / $demo_graphql_ref live in graphql/
	molRuntime: '$demo_graphql',
	// keep GraphQL names in generated type names as-is. Operation names are
	// auto-derived from the file path (app/notes.graphql -> demo_app_notes ->
	// demo_app_notesQuery); fragments keep their authored names
	// (fragment DemoNoteCard_note -> DemoNoteCard_noteFragment)
	namingConvention: 'keep',
	// Relay-style fragment masking: a spread field is typed as an opaque
	// fragment ref, not inlined fields
	inlineFragmentTypes: 'mask',
}

module.exports = {
	schema: 'server/schema.graphql',
	generates: {
		// the app itself: the safe default, any mutation refetches every query
		'./': {
			preset: require('./preset.js'),
			plugins: [], // per-file plugin chains are built by the preset
			documents: ['app/**/*.graphql', 'note/**/*.graphql'],
			config: { ...base, revalidation: 'all' },
		},
		// test fixtures proving the other two modes (see graphql/index.test.ts);
		// the demo app stays on 'all'
		'./graphql/fixture/typenames': {
			preset: require('./preset.js'),
			plugins: [],
			// @touches is client-side: declare it for validation only
			schema: ['directive @touches(types: [String!]!) on MUTATION'],
			documents: ['graphql/fixture/typenames/*.graphql'],
			config: { ...base, revalidation: 'by_typenames', molSchemaTypes: false },
		},
		'./graphql/fixture/disable': {
			preset: require('./preset.js'),
			plugins: [],
			documents: ['graphql/fixture/disable/*.graphql'],
			config: { ...base, revalidation: 'disable', molSchemaTypes: false },
		},
	},
}
