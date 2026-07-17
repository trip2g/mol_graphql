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
	 * Transport seam: how an operation reaches an executor. Overridable —
	 * the default POSTs to $demo_graphql_endpoint() (sync-over-fiber via
	 * $mol_fetch); the static GitHub Pages build swaps in an in-browser
	 * executor (see pages/mock.mjs) with no server at all. A replacement
	 * must return synchronously too (the fiber runtime expects it).
	 */
	export let $demo_graphql_transport = (query: string, variables?: object) =>
		$mol_fetch.json($demo_graphql_endpoint(), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query, variables }),
		}) as { data?: unknown; errors?: GraphQLErrorItem[] }

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
	 *
	 * CONVENTION: every mutation refetches every query on the current page.
	 * A query subscribes to the marker; a mutation bumps it; all $mol_mem-oized
	 * queries re-run. This trades some duplicate requests for the guarantee that
	 * the UI is never stale because someone forgot a cache-invalidation callback.
	 * Don't fear the duplicates by default; optimize only when a real cost shows up.
	 *
	 * Escape hatch: pass `{ revalidate: false }`. On a mutation it skips the bump
	 * (this write shouldn't refresh the page); on a query it skips the subscribe
	 * (this read is static and shouldn't refetch when others mutate).
	 *
	 * Kept small and swappable on purpose: smarter per-fragment reactivity can
	 * later live here (or in unmask) without touching generated code.
	 */
	export function $demo_graphql_request(query: string, variables?: object, opts?: { revalidate?: boolean }): unknown {

		const mutation = /^\s*mutation\b/.test(query)
		const revalidate = opts?.revalidate !== false

		// queries subscribe to the invalidation marker before fetching
		if (!mutation && revalidate) generation.value()

		const res = $demo_graphql_transport(query, variables)

		if (res.errors) throw new $demo_graphql_error('GraphQL Error', res.errors)

		if (mutation && revalidate) generation.value(generation.value() + 1)

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
