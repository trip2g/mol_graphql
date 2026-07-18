namespace $ {

	// $demo_graphql_subscription: the raw SSE subscription runtime.
	//
	// Subscriptions are a SEPARATE runtime on purpose, NOT the request seam
	// the query/mutation wrappers share: a query is one request returning one
	// value through the sync fiber transport, while a subscription is a
	// long-lived stream pushing many values. The codegen still TYPES the
	// stream: a subscription .graphql file (see note/live/note_liked.graphql)
	// generates a wrapper that returns this host with the schema-derived
	// result type as `Data`. This runtime turns the document into a reactive
	// host: reading `.data()` spins the stream up, every server event writes
	// the mem, every subscribed view re-renders.

	/** What one live stream reports back to its host. */
	export type $demo_graphql_subscription_events = {
		open(): void
		next(data: unknown): void
		fail(error: Error): void
	}

	/**
	 * Connect seam, swappable like the request transport: opens ONE stream for
	 * the subscription document and pushes every server event until the signal
	 * aborts; returning or throwing makes the host reconnect after
	 * restart_delay(). The default POSTs to $demo_graphql_endpoint() with
	 * `Accept: text/event-stream` (the graphql-sse "distinct connections"
	 * protocol) and parses the SSE lines. The mock module
	 * (graphql/mock/mock.ts) swaps in a local emitter with zero network.
	 */
	export let $demo_graphql_subscription_connect = async (
		query: string,
		variables: Record<string, unknown>,
		events: $demo_graphql_subscription_events,
		signal: AbortSignal,
	) => {

		const response = await fetch($demo_graphql_endpoint(), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'text/event-stream',
			},
			body: JSON.stringify({ query, variables }),
			signal,
		})

		if (!response.ok) throw new Error(`SSE: ${response.status} ${response.statusText}`)

		const reader = response.body!.getReader()
		const decoder = new TextDecoder()
		let buffer = ''
		let event_type = ''

		events.open()

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) return

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split('\n')
				buffer = lines.pop()!

				for (const line of lines) {
					if (line.startsWith('event:')) {
						event_type = line.slice(6).trim()
					} else if (line.startsWith('data:')) {
						const payload = line.slice(5).trim()
						if (event_type === 'next') {
							const parsed = JSON.parse(payload)
							if (parsed.errors) events.fail(new $demo_graphql_error('Subscription error', parsed.errors))
							if (parsed.data) events.next(parsed.data)
						} else if (event_type === 'complete') {
							return
						}
						event_type = ''
					}
				}
			}
		} finally {
			reader.releaseLock()
		}

	}

	/**
	 * Reactive host of one subscription: `.data()` is the latest event payload
	 * (null before the first one), `.error()` the latest failure. Reading
	 * `.data()` pulls `source()`, which launches the reconnect loop and whose
	 * destructor aborts it, so the stream lives exactly while something on the
	 * page renders the data.
	 */
	export class $demo_graphql_subscription_host<Data = any> extends $mol_object {

		restart_delay() { return 3000 }
		query() { return '' }
		variables() { return {} as Record<string, unknown> }

		@ $mol_mem
		opened(next?: boolean) { return next ?? false }

		@ $mol_mem
		error_packed(next?: null | [Error]) { return next ?? null }

		error(next?: null | Error) {
			return this.error_packed(next ? [next] : next)?.[0] ?? null
		}

		/** Latest event payload; reading it keeps the stream alive. */
		@ $mol_mem
		data(next?: Data | null): Data | null {
			this.source()
			return next ?? null
		}

		@ $mol_mem
		source(reset?: null) {
			const abort = new AbortController()
			this.stream(abort.signal)
			return { destructor: () => abort.abort() }
		}

		protected async stream(signal: AbortSignal) {

			const events: $demo_graphql_subscription_events = {
				open: () => {
					this.opened(true)
					this.error(null)
				},
				next: data => this.data(data as Data),
				fail: error => this.error(error),
			}

			while (!signal.aborted) {
				try {
					await $demo_graphql_subscription_connect(this.query(), this.variables(), events, signal)
				} catch (error) {
					if (!signal.aborted) this.error(error instanceof Error ? error : new Error(String(error)))
				}
				if (signal.aborted) return
				this.opened(false)
				await new Promise(done => setTimeout(done, this.restart_delay()))
			}

		}

	}

	const hosts = new Map<string, $demo_graphql_subscription_host>()

	/**
	 * One shared host per document + variables (trip2g keeps the same
	 * registry): two components subscribing to the same stream share one
	 * connection and one reactive value. `Data` is a compile-time claim only
	 * (the generated wrappers pin it to the schema-derived result type); the
	 * runtime is identical for every caller.
	 */
	export function $demo_graphql_subscription<Data = any>(
		query: string,
		variables?: Record<string, unknown>,
	): $demo_graphql_subscription_host<Data> {
		const key = query + JSON.stringify(variables ?? {})
		let host = hosts.get(key)
		if (!host) {
			host = new $demo_graphql_subscription_host()
			host.query = () => query
			host.variables = () => variables ?? {}
			hosts.set(key, host)
		}
		return host as $demo_graphql_subscription_host<Data>
	}

}
