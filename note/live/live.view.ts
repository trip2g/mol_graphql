namespace $.$$ {

	// The subscription document lives in note_liked.graphql and the codegen
	// bakes its result type into the wrapper, same as queries/mutations. Only
	// the TYPE is generated: a stream is not a request, so the wrapper returns
	// the raw runtime host, not the sync request seam.
	export class $demo_note_live extends $.$demo_note_live {

		@ $mol_mem
		subscription() {
			return $demo_note_live_note_liked()
		}

		/** Latest note_liked event, null until the first one arrives. */
		@ $mol_mem
		last() {
			return this.subscription().data()?.note_liked ?? null
		}

		/** Counts events, not renders: the probe peeks its own previous value without subscribing (same pattern as the render probes). */
		@ $mol_mem
		events_count(): number {
			const prev = $mol_wire_probe(() => this.events_count()) ?? 0
			return this.last() ? prev + 1 : prev
		}

		status_title() {
			const error = this.subscription().error()
			if (error) return `Live (SSE): ${error.message}`
			const state = this.subscription().opened() ? 'connected' : 'connecting'
			return `Live (SSE): ${state} / events: ${this.events_count()}`
		}

		last_title() {
			const last = this.last()
			if (!last) return 'No likes seen yet: like a note, in another tab too'
			return `Someone liked "${last.title}" (${last.id}), now ${last.likes} likes`
		}

		/**
		 * Pulled from the view.tree body, so rendering subscribes it: every SSE
		 * event re-runs this mem (the trip2g watcher idiom). The side effect
		 * leaves the computation via setTimeout: bumping the universal marker
		 * refetches every page query, so the note cards reflect a like made in
		 * ANOTHER tab. The subscription drives the same revalidation convention
		 * as a local mutation.
		 */
		@ $mol_mem
		watcher(next?: null) {
			if (!this.last()) return null
			setTimeout(() => $demo_graphql_revalidate(), 0)
			return null
		}

	}

}
