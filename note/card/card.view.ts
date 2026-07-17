namespace $.$$ {

	export class $demo_note_card extends $.$demo_note_card {

		/**
		 * Unmask: this component declared the fragment, so it gets the fields.
		 * `note_ref` is typed right in the .view.tree (`note_ref null
		 * $demo_note_card_note_ref`), and mol properties are null-by-default, so
		 * the ref arrives as `ref | null`. The parent always binds a real ref
		 * (schema-non-null list element), so the checked unmask asserts that:
		 * a broken binding throws a clear error naming the fragment instead of
		 * TS `!` letting null crash later.
		 */
		@ $mol_mem
		note() {
			return $demo_note_card_note_unmask_not_null(this.note_ref())
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

		/**
		 * Counts real recomputations of this card's query-backed data.
		 *
		 * Reading note_ref() subscribes this mem to the same upstream atom as
		 * note() — the parent page query $demo_app_notes memoized in
		 * $demo_app.notes() — so it re-runs exactly when note() re-runs: every
		 * time the page query refetches with changed data (any Like anywhere).
		 * It can't just read note(): $mol_mem keeps the old value when a
		 * recompute returns deep-equal data (unchanged card), so note() never
		 * notifies for other cards' likes even though its body re-ran.
		 *
		 * $mol_wire_probe peeks this mem's own previous cache without
		 * subscribing (no cycle) and sees only committed values, so fiber
		 * replays while the fetch is suspended don't double-count.
		 */
		@ $mol_mem
		renders(): number {
			this.note_ref()
			return ($mol_wire_probe(() => this.renders()) ?? 0) + 1
		}

		renders_title() {
			return `renders: ${this.renders()}`
		}

	}

}
