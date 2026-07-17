namespace $.$$ {

	export class $demo_app extends $.$demo_app {

		/** Plain typed query: result type is baked into $demo_app_viewer by the codegen. */
		@ $mol_mem
		greeting() {
			return `Reading list of ${$demo_app_viewer().viewer.name}`
		}

		/**
		 * Page query. Its selection only owns `id` — note fields come from the
		 * spread `...DemoNoteCard_note`, so `notes()[0].title` here is a TYPE
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

	}

}
