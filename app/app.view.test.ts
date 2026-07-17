namespace $.$$ {

	// In-memory GraphQL "server" + per-operation call counters.
	// Likes increment statefully, like the real mock server, so a refetch
	// after a Like returns changed data and downstream mems re-run.
	function graphql_mock() {

		const notes = [
			{ id: 'n1', title: 'First', body: 'Alpha', likes: 0, author: { name: 'Ann' } },
			{ id: 'n2', title: 'Second', body: 'Beta', likes: 5, author: { name: 'Bob' } },
		]

		const calls = {} as Record<string, number>

		const transport: typeof $demo_graphql_transport = (query, variables) => {

			const name = /^\s*(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? ''
			calls[name] = (calls[name] ?? 0) + 1

			switch (name) {

				case 'DemoAppViewer':
					return { data: { viewer: { name: 'Tester' } } }

				case 'DemoAppNotes':
					return { data: { notes: notes.map(note => ({ ...note })) } }

				case 'DemoNoteCardLike': {
					const note = notes.find(note => note.id === (variables as { id: string }).id)!
					note.likes += 1
					return { data: { note_like: { id: note.id, likes: note.likes } } }
				}

				default:
					return { errors: [{ message: `Unmocked operation: ${name}` }] }

			}

		}

		return { calls, transport }
	}

	// $demo_graphql_transport is a namespace-level `export let` that
	// $demo_graphql_request reads dynamically on every call, so a test swaps
	// it globally and restores it in `finally`. Tests run strictly one after
	// another, so the swap can not leak into another case. The isolated test
	// context can not intercept it: $demo_graphql_request is a free function,
	// not a context read.
	function with_transport<Result>(
		transport: typeof $demo_graphql_transport,
		action: () => Result,
	): Result {
		const orig = $demo_graphql_transport
		$demo_graphql_transport = transport
		try {
			return action()
		} finally {
			$demo_graphql_transport = orig
		}
	}

	$mol_test({

		'canned responses flow through page queries into the components'($) {
			const { calls, transport } = graphql_mock()
			with_transport(transport, () => {

				const app = $demo_app.make({ $ })

				$mol_assert_equal(app.greeting(), 'Reading list of Tester')
				$mol_assert_equal(app.notes().length, 2)
				$mol_assert_equal(app.notes()[1].id, 'n2') // only `id` is visible here: the rest is masked

				// the full note fields are only reachable through the card's unmask
				const card = app.Note_card('n1') as $demo_note_card
				$mol_assert_equal(card.note().title, 'First')
				$mol_assert_equal(card.Like().title(), '♥ 0')

				$mol_assert_equal(calls['DemoAppViewer'], 1)
				$mol_assert_equal(calls['DemoAppNotes'], 1)

			})
		},

		'a mutation refetches every query on the page'($) {
			const { calls, transport } = graphql_mock()
			with_transport(transport, () => {

				const app = $demo_app.make({ $ })
				const card = app.Note_card('n1') as $demo_note_card

				$mol_assert_equal(app.greeting(), 'Reading list of Tester')
				$mol_assert_equal(card.note().likes, 0)
				$mol_assert_equal(card.renders(), 1)
				$mol_assert_equal(calls['DemoAppViewer'], 1)
				$mol_assert_equal(calls['DemoAppNotes'], 1)

				card.like() // typed mutation: bumps the invalidation marker

				$mol_assert_equal(calls['DemoNoteCardLike'], 1)

				// next read re-runs every page query: the convention
				$mol_assert_equal(card.note().likes, 1)
				$mol_assert_equal(app.greeting(), 'Reading list of Tester')
				$mol_assert_equal(calls['DemoAppNotes'], 2)
				$mol_assert_equal(calls['DemoAppViewer'], 2)
				$mol_assert_equal(card.renders(), 2)

			})
		},

		'revalidate:false query opts out: fetched exactly once across a mutation'($) {
			const { calls, transport } = graphql_mock()
			with_transport(transport, () => {

				const app = $demo_app.make({ $ })

				$mol_assert_equal(app.viewer_static().viewer.name, 'Tester')
				$mol_assert_equal(app.static_fetches(), 1)
				$mol_assert_equal(calls['DemoAppViewer'], 1)

				$demo_note_card_like({ id: 'n1' }) // a revalidating mutation elsewhere on the page

				$mol_assert_equal(app.viewer_static().viewer.name, 'Tester')
				$mol_assert_equal(app.static_fetches(), 1)
				$mol_assert_equal(calls['DemoAppViewer'], 1) // exactly once: the opt-out

			})
		},

		'revalidate:false mutation opts out: page queries stay put'($) {
			const { calls, transport } = graphql_mock()
			with_transport(transport, () => {

				const app = $demo_app.make({ $ })

				$mol_assert_equal(app.notes().length, 2)
				$mol_assert_equal(calls['DemoAppNotes'], 1)

				$demo_note_card_like({ id: 'n1' }, { revalidate: false }) // silent write

				$mol_assert_equal(app.notes().length, 2)
				$mol_assert_equal(calls['DemoAppNotes'], 1) // no refetch

			})
		},

	})

}
