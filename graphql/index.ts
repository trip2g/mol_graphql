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

	/** GraphQL endpoint. Overridable - swap it for another transport/host. */
	export let $demo_graphql_endpoint = () => 'http://localhost:4000/graphql'

	/**
	 * Transport seam: how an operation reaches an executor. Overridable -
	 * the default POSTs to $demo_graphql_endpoint() (sync-over-fiber via
	 * $mol_fetch); the mock module (graphql/mock/mock.ts, unnamed here so the
	 * builder does not bundle it in) swaps in an in-browser mock. A replacement
	 * must return synchronously too (the fiber runtime expects it).
	 */
	export let $demo_graphql_transport = (query: string, variables?: object) =>
		$mol_fetch.json($demo_graphql_endpoint(), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query, variables }),
		}) as { data?: unknown; errors?: GraphQLErrorItem[] }

	/**
	 * Reactive invalidation markers - deliberately NOT a normalized cache.
	 * `all` is the universal generation counter: queries with unknown reads
	 * subscribe to it, every revalidating mutation bumps it. `type(name)` is a
	 * per-typename marker family for the `by_typenames` codegen mode: a query
	 * subscribes to the markers of the object types it reads, a mutation bumps
	 * the markers of the types it writes. `unknown_writes` bridges the mixed
	 * case: mutations with unknown writes bump it, queries with KNOWN reads
	 * subscribe to it, so a hand-written mutation still refreshes typed queries.
	 * With no metadata anywhere this collapses to exactly the single global
	 * counter (this demo's default).
	 */
	class $demo_graphql_markers extends $mol_object2 {

		/** Universal generation: subscribed by queries with unknown reads, bumped by every revalidating mutation. */
		@ $mol_mem
		all(next = 0) {
			return next
		}

		/** Bumped by mutations with unknown writes, subscribed by queries with known reads. */
		@ $mol_mem
		unknown_writes(next = 0) {
			return next
		}

		/** Per-typename marker: reading subscribes the caller, writing bumps every subscriber. */
		@ $mol_mem_key
		type(name: string, next = 0) {
			return next
		}

	}

	const markers = new $demo_graphql_markers()

	/** Per-call options of the request layer; generated wrappers bake `reads`/`writes` in per codegen `revalidation` mode. */
	export type $demo_graphql_opts = {
		/** `false` opts this call out: a query does not subscribe, a mutation does not bump. Works in every mode. */
		revalidate?: boolean
		/** Object typenames this query reads. Absent = unknown (assume all types). `[]` = none (never refetch). */
		reads?: readonly string[]
		/** Object typenames this mutation writes. Absent = unknown (assume all types). `[]` = none (bump nothing). */
		writes?: readonly string[]
	}

	/**
	 * Request layer used by all generated `*.graphql.ts` wrappers.
	 *
	 * CONVENTION (default `revalidation: 'all'`): every mutation refetches every
	 * query on the current page. A query subscribes to the universal marker; a
	 * mutation bumps it; all $mol_mem-oized queries re-run. This trades some
	 * duplicate requests for the guarantee that the UI is never stale because
	 * someone forgot a cache-invalidation callback. Don't fear the duplicates by
	 * default; optimize only when a real cost shows up.
	 *
	 * The `by_typenames` codegen mode narrows the scope: wrappers pass static
	 * `reads`/`writes` type sets, so only queries reading a written type refetch.
	 * Absent metadata degrades to the universal behavior above, so hand-written
	 * calls and generated ones mix safely.
	 *
	 * Escape hatch: pass `{ revalidate: false }`. On a mutation it skips the bump
	 * (this write shouldn't refresh the page); on a query it skips the subscribe
	 * (this read is static and shouldn't refetch when others mutate).
	 *
	 * Kept small and swappable on purpose: smarter per-fragment reactivity can
	 * later live here (or in unmask) without touching generated code.
	 */
	export function $demo_graphql_request(query: string, variables?: object, opts?: $demo_graphql_opts): unknown {

		const mutation = /^\s*mutation\b/.test(query)
		const revalidate = opts?.revalidate !== false

		// queries subscribe to the invalidation markers before fetching
		if (!mutation && revalidate) {
			const reads = opts?.reads
			if (!reads) {
				markers.all()
			} else if (reads.length) {
				markers.unknown_writes()
				for (const name of reads) markers.type(name)
			}
		}

		const res = $demo_graphql_transport(query, variables)

		if (res.errors) throw new $demo_graphql_error('GraphQL Error', res.errors)

		// mutations bump the markers on success
		if (mutation && revalidate) {
			const writes = opts?.writes
			if (!writes) {
				markers.all(markers.all() + 1)
				markers.unknown_writes(markers.unknown_writes() + 1)
			} else if (writes.length) {
				markers.all(markers.all() + 1)
				for (const name of writes) markers.type(name, markers.type(name) + 1)
			}
		}

		return res.data
	}

	/**
	 * Opaque fragment reference - what a parent's masked result carries at a
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
