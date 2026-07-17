// graphql-codegen plugin: emits the $mol-style typed seam for one .graphql file.
//
// For an operation file (query/mutation):
//   export function $demo_app_notes(): DemoAppNotesQuery {
//       return $demo_graphql_request(`<operation + all spread fragment definitions>`) as DemoAppNotesQuery
//   }
// The result/variables types are baked in by the generator — no reliance on
// byte-for-byte literal matching. Fragment spreads are merged into the sent
// document at codegen time (transitively, by unique fragment name).
//
// For a fragment file:
//   export type $demo_note_card_note = DemoNoteCard_noteFragment
//   export function $demo_note_card_note_unmask(ref): DemoNoteCard_noteFragment  — identity, no request.
//
// It wraps the stock `typescript` / `typescript-operations` plugins and escapes
// every `$` they (or the embedded GraphQL) produce as `\u0024`: the $mol builder
// scans sources for $-prefixed names to build its module graph, and would
// otherwise treat GraphQL variables ($id) and masking keys (' $fragmentRefs')
// as module references. TS/JS treat $ as the same character, so types and
// runtime strings are unchanged. $-names WE emit ($demo_..., doc-comment deps)
// stay unescaped on purpose — those are real module references.

const typescriptPlugin = require('@graphql-codegen/typescript')
const operationsPlugin = require('@graphql-codegen/typescript-operations')

const SUFFIX = { query: 'Query', mutation: 'Mutation', subscription: 'Subscription' }

module.exports = {
	plugin: async (schema, documents, config, info) => {
		if (config.molMode === 'schema') {
			const out = await typescriptPlugin.plugin(schema, documents, stockConfig(config), info)
			return escapeDollars(flatten(out))
		}

		const runtime = config.molRuntime || '$graphql'
		const fragments = config.molFragments || {}
		const symbol = config.molSymbol

		const types = await operationsPlugin.plugin(schema, documents, stockConfig(config), info)
		const lines = [escapeDollars(flatten(types))]

		for (const doc of documents) {
			for (const def of doc.document.definitions) {
				if (def.kind === 'OperationDefinition') {
					lines.push(...operationCode(def, doc, { symbol, runtime, fragments }))
				} else if (def.kind === 'FragmentDefinition') {
					lines.push(...fragmentCode(def, { symbol, runtime }))
				}
			}
		}

		return lines.join('\n')
	},
}

// strip our own mol* keys before handing config to the stock plugins
function stockConfig(config) {
	const { molMode, molRuntime, molFragments, molSymbol, molSchemaTypes, ...rest } = config
	return rest
}

function flatten(out) {
	if (typeof out === 'string') return out
	return [...(out.prepend || []), out.content || '', ...(out.append || [])].join('\n')
}

function escapeDollars(code) {
	return code.replace(/\$/g, '\\u0024')
}

function operationCode(def, doc, { symbol, runtime, fragments }) {
	if (!def.name) throw new Error(`${doc.location}: anonymous operations are not supported — name it`)
	if (def.operation === 'subscription') {
		throw new Error(`${doc.location}: subscriptions are out of scope for this demo`)
	}

	const opName = def.name.value
	const resultType = opName + SUFFIX[def.operation]
	const varsType = resultType + 'Variables'

	// merge spread fragments (transitive closure over the global registry)
	const closure = fragmentClosure(def, fragments, doc.location)
	const merged = [(doc.rawSDL || '').trim(), ...closure.map(name => fragments[name].source)].join('\n\n')

	// typed variables parameter
	const varDefs = def.variableDefinitions || []
	const required = varDefs.some(v => v.type.kind === 'NonNullType' && !v.defaultValue)
	const param = varDefs.length === 0 ? '' : `variables${required ? '' : '?'}: ${varsType}`
	const arg = varDefs.length === 0 ? '' : ', variables'

	const code = ['']
	if (closure.length) {
		// doc-comment so the $mol builder records dependencies on the fragment
		// modules (it scans $-names, skipping non-doc comments)
		code.push(`/** Spreads fragments: ${closure.map(name => fragments[name].symbol).join(', ')} */`)
	}
	code.push(
		`export function ${symbol}(${param}): ${resultType} {`,
		`\treturn ${runtime}_request(\`${escapeTemplate(merged)}\`${arg}) as ${resultType}`,
		`}`,
	)
	return code
}

function fragmentCode(def, { symbol, runtime }) {
	const fragType = def.name.value + 'Fragment'
	return [
		``,
		`/** Data declared by fragment \`${def.name.value}\` — spread it anywhere as \`...${def.name.value}\`. */`,
		`export type ${symbol} = ${fragType}`,
		``,
		`/** Identity accessor: turns an opaque fragment ref (masked parent data) into the typed fragment fields. */`,
		`export function ${symbol}_unmask(ref: ${runtime}_ref<${fragType}>): ${fragType} {`,
		`\treturn ref as ${fragType}`,
		`}`,
	]
}

function fragmentClosure(def, fragments, location) {
	const seen = new Set()
	const queue = [...collectSpreads(def)]
	while (queue.length) {
		const name = queue.shift()
		if (seen.has(name)) continue
		const frag = fragments[name]
		if (!frag) throw new Error(`${location}: fragment "${name}" is spread but not defined in any .graphql file`)
		seen.add(name)
		queue.push(...frag.spreads)
	}
	return [...seen]
}

function collectSpreads(node, acc = new Set()) {
	if (node.kind === 'FragmentSpread') acc.add(node.name.value)
	for (const key of ['selectionSet', 'selections']) {
		const sub = node[key]
		if (Array.isArray(sub)) sub.forEach(child => collectSpreads(child, acc))
		else if (sub && typeof sub === 'object') collectSpreads(sub, acc)
	}
	return acc
}

// escape for embedding in a template literal; all `$` become `\u0024` so the
// $mol dependency scanner ignores GraphQL variables (also neutralizes `${`)
function escapeTemplate(str) {
	return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\u0024')
}
