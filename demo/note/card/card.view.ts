namespace $.$$ {

	export class $demo_note_card extends $.$demo_note_card {

		/**
		 * Opaque fragment ref bound by the parent in view.tree
		 * (`note_ref <= card_ref*`). The tree default is `null`, hence the
		 * `super.note_ref()` narrowing dance — standard $mol idiom.
		 */
		note_ref(): $demo_graphql_ref<$demo_note_card_note> {
			return super.note_ref()
		}

		/** Unmask: this component declared the fragment, so it gets the fields. */
		@ $mol_mem
		note() {
			return $demo_note_card_note_unmask(this.note_ref())
		}

		note_title() {
			return this.note().title
		}

		note_body() {
			return this.note().body
		}

		author_name() {
			return `— ${this.note().author.name}`
		}

		like_title() {
			return `♥ ${this.note().likes}`
		}

		/** Typed mutation; bumps the reactive marker, all queries refetch. */
		like(next?: Event) {
			$demo_note_card_like({ id: this.note().id })
		}

	}

}
