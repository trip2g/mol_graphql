namespace $ {

	type GraphQLErrorItem = {
		message: string
		path?: string[]
	}

	export class $demo_graphql_error extends Error {
		constructor(message: string, public detail?: GraphQLErrorItem[]) {
			if (detail) {
				for (const err of detail) message += `. ${err.message}`
			}
			super(message)
		}
	}

	/** GraphQL endpoint. Overridable — swap it for another transport/host. */
	export let $demo_graphql_endpoint = () => 'http://localhost:4000/graphql'

	/**
	 * Reactive invalidation marker — deliberately NOT a normalized cache.
	 * Every query subscribes to the generation counter; every mutation bumps it,
	 * so all $mol_mem-oized query results refetch. This is the whole "cache
	 * consistency" story of this demo (Relay's store is intentionally dropped).
	 */
	class $demo_graphql_generation extends $mol_object2 {
		@ $mol_mem
		value(next = 0) {
			return next
		}
	}

	const generation = new $demo_graphql_generation()

	/**
	 * Request layer used by all generated `*.graphql.ts` wrappers.
	 * Kept small and swappable on purpose: smarter per-fragment reactivity can
	 * later live here (or in unmask) without touching generated code.
	 */
	export function $demo_graphql_request(query: string, variables?: object): unknown {

		const mutation = /^\s*mutation\b/.test(query)

		// queries subscribe to the invalidation marker before fetching
		if (!mutation) generation.value()

		const res = $mol_fetch.json($demo_graphql_endpoint(), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query, variables }),
		}) as { data?: unknown; errors?: GraphQLErrorItem[] }

		if (res.errors) throw new $demo_graphql_error('GraphQL Error', res.errors)

		if (mutation) generation.value(generation.value() + 1)

		return res.data
	}

	/**
	 * Opaque fragment reference — what a parent's masked result carries at a
	 * `...Fragment_name` spread site, and what it passes to the component that
	 * owns the fragment. Only `<fragment_file>_unmask(ref)` gets the fields back.
	 *
	 * `\u0024` is just an escaped `$`: the $mol builder scans sources for
	 * $-names, and the masking keys (space + dollar + fragmentName/fragmentRefs)
	 * would read as phantom module references.
	 */
	export type $demo_graphql_ref<Frag> = Frag extends { ' \u0024fragmentName'?: infer Name extends string }
		? { ' \u0024fragmentRefs'?: { [Key in Name]: Frag } }
		: never

}
