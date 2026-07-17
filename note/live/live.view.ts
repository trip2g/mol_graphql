namespace $.$$ {

	// The subscription document is a hand-written string ON PURPOSE: the
	// codegen throws on subscription documents (codegen/molplugin.js), because
	// a stream is not a request - it goes through the raw runtime host, not
	// through the sync request seam the generated wrappers share.
	const NOTE_LIKED_QUERY = `
		subscription demo_note_live {
			note_liked {
				id
				title
				likes
			}
		}
	`

	type note_liked = { id: string, title: string, likes: number }

	export class $demo_note_live extends $.$demo_note_live {

		@ $mol_mem
		subscription() {
			return $demo_graphql_subscription(NOTE_LIKED_QUERY)
		}

		/** Latest note_liked event, null until the first one arrives. */
		@ $mol_mem
		last(): note_liked | null {
			const data = this.subscription().data() as { note_liked?: note_liked } | null
			return data?.note_liked ?? null
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
