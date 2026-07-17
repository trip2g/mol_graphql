namespace $.$$ {

	// What a masked parent query result physically carries at a
	// `...demo_note_card_note` spread site: the full fragment data,
	// hidden behind the opaque ref TYPE. No network involved.
	function note_ref_stub(): $demo_graphql_ref<$demo_note_card_note> {
		// masking is type-level only, so the stub IS the data AND the ref
		const data: demo_note_card_noteFragment & $demo_graphql_ref<$demo_note_card_note> = {
			id: 'n1',
			title: 'Hello',
			body: 'World',
			likes: 2,
			author: { name: 'Ann' },
		}
		return data
	}

	$mol_test({

		'note() unmasks the fragment ref into typed fields'($) {

			const card = $demo_note_card.make({
				$,
				note_ref: note_ref_stub,
			})

			const note = card.note()

			$mol_assert_equal(note.id, 'n1')
			$mol_assert_equal(note.title, 'Hello')
			$mol_assert_equal(note.body, 'World')
			$mol_assert_equal(note.likes, 2)
			$mol_assert_equal(note.author.name, 'Ann')

		},

		'card widgets render the unmasked fields'($) {

			const card = $demo_note_card.make({
				$,
				note_ref: note_ref_stub,
			})

			$mol_assert_equal(card.Title().title(), 'Hello')
			$mol_assert_equal(card.Body().title(), 'World')
			$mol_assert_equal(card.Author().title(), '— Ann')
			$mol_assert_equal(card.Like().title(), '♥ 2')
			$mol_assert_equal(card.renders(), 1)

		},

		'unmask preserves nullability: a non-null ref yields the fragment'($) {

			// the non-null overload: the result needs no null check
			const note: $demo_note_card_note = $demo_note_card_note_unmask(note_ref_stub())
			$mol_assert_equal(note.title, 'Hello')

		},

		'unmask preserves nullability: a null ref stays null'($) {

			// a nullable schema field types its ref as `Ref | null`; the overload
			// carries that through, so the result MUST be checked before field access
			const ref = null as $demo_graphql_ref<$demo_note_card_note> | null
			const note: $demo_note_card_note | null | undefined = $demo_note_card_note_unmask(ref)
			$mol_assert_equal(note, null)

		},

		'unmask_not_null returns the fields for a present ref'($) {

			const note = $demo_note_card_note_unmask_not_null(note_ref_stub())
			$mol_assert_equal(note.title, 'Hello')
			$mol_assert_equal(note.author.name, 'Ann')

		},

		'unmask_not_null throws on a null ref, naming the fragment'($) {

			$mol_assert_fail(
				() => $demo_note_card_note_unmask_not_null(null),
				'null fragment ref for demo_note_card_note',
			)

		},

	})

}
