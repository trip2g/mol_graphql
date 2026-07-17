namespace $.$$ {

	export class $demo_app extends $.$demo_app {

		/** Plain typed query: result type is baked into $demo_app_viewer by the codegen. */
		@ $mol_mem
		greeting() {
			return `Reading list of ${$demo_app_viewer().viewer.name}`
		}

		/**
		 * Page query. Its selection only owns `id` — note fields come from the
		 * spread `...demo_note_card_note`, so `notes()[0].title` here is a TYPE
		 * ERROR (masking): only $demo_note_card can unmask its fragment.
		 */
		@ $mol_mem
		notes() {
			return $demo_app_notes().notes
		}

		@ $mol_mem
		note_rows() {
			return this.notes().map(note => this.Note_card(note.id))
		}

		/** Masked fragment ref handed down to the card by key. */
		card_ref(id: string): $demo_graphql_ref<$demo_note_card_note> {
			return this.notes().find(note => note.id === id)!
		}

		/**
		 * Opt-out demo: the SAME viewer query as greeting(), but through the
		 * generated wrapper with { revalidate: false }, so it does NOT subscribe
		 * to the invalidation marker and never refetches when a mutation bumps it
		 * (watch static_fetches stay at 1 while every card's renders counter ticks
		 * on Like). Every generated wrapper takes that opts param, so opting a
		 * query out needs no hand-written GraphQL.
		 */
		@ $mol_mem
		viewer_static() {
			return $demo_app_viewer({ revalidate: false })
		}

		/** Same probe-counter pattern as $demo_note_card.renders — see there. */
		@ $mol_mem
		static_fetches(): number {
			this.viewer_static()
			return ($mol_wire_probe(() => this.static_fetches()) ?? 0) + 1
		}

		static_title() {
			return `revalidate:false — not refetched · viewer: ${this.viewer_static().viewer.name} · fetches: ${this.static_fetches()}`
		}

	}

}
