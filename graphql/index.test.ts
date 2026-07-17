namespace $.$$ {

	// Proof of the compile-time `revalidation` modes (see codegen/graphqlgen.js):
	// the wrappers under graphql/fixture/ are generated with
	// `revalidation: 'by_typenames'` and `'disable'`, while the demo app itself
	// stays on the default `'all'` (covered by app/app.view.test.ts).

	// In-memory GraphQL "server" + per-operation call counters, same seam as
	// app/app.view.test.ts. `note_like` creates the note when missing so the
	// empty-list case can observe the first insert.
	function graphql_mock(notes: { id: string, title: string, body: string, likes: number, author: { name: string } }[]) {

		const calls = {} as Record<string, number>

		const like = (id: string) => {
			let note = notes.find(note => note.id === id)
			if (!note) {
				note = { id, title: 'Fresh', body: '', likes: 0, author: { name: 'Ann' } }
				notes.push(note)
			}
			note.likes += 1
			return { data: { note_like: { id: note.id, likes: note.likes } } }
		}

		const transport: typeof $demo_graphql_transport = (query, variables) => {

			const name = /^\s*(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? ''
			calls[name] = (calls[name] ?? 0) + 1

			switch (name) {

				case 'demo_graphql_fixture_typenames_viewer':
				case 'demo_graphql_fixture_disable_viewer':
				case 'Dumb':
					return { data: { viewer: { name: 'Tester' } } }

				case 'demo_graphql_fixture_typenames_notes':
					return { data: { notes: notes.map(note => ({ ...note })) } }

				case 'demo_graphql_fixture_typenames_like':
				case 'demo_graphql_fixture_typenames_touch':
				case 'demo_graphql_fixture_disable_like':
					return like((variables as { id: string }).id)

				case 'Bump':
					return { data: { bump: true } }

				default:
					return { errors: [{ message: `Unmocked operation: ${name}` }] }

			}

		}

		return { calls, transport }
	}

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

	// $mol_mem-oized readers over the fixture wrappers: subscription happens
	// through the mem fiber, exactly like page queries in the app.
	// Plain (non-$) class name on purpose: local to this test.
	class Probe extends $mol_object2 {

		/** by_typenames: subscribes to the Note and User markers (reads: ['Note', 'User']). */
		@ $mol_mem
		notes() {
			return $demo_graphql_fixture_typenames_notes().notes
		}

		/** by_typenames: subscribes to the User marker only (reads: ['User']). */
		@ $mol_mem
		viewer() {
			return $demo_graphql_fixture_typenames_viewer().viewer.name
		}

		/** disable: subscribes to nothing (reads: []). */
		@ $mol_mem
		viewer_disabled() {
			return $demo_graphql_fixture_disable_viewer().viewer.name
		}

		/** Hand-written call with no metadata: degrades to the universal marker. */
		@ $mol_mem
		dumb() {
			return $demo_graphql_request('query Dumb { viewer { name } }') as { viewer: { name: string } }
		}

	}

	function stock_notes() {
		return [
			{ id: 'n1', title: 'First', body: 'Alpha', likes: 0, author: { name: 'Ann' } },
			{ id: 'n2', title: 'Second', body: 'Beta', likes: 5, author: { name: 'Bob' } },
		]
	}

	$mol_test({

		'by_typenames: a Note mutation refetches Note readers, User-only queries stay put'($) {
			const { calls, transport } = graphql_mock(stock_notes())
			with_transport(transport, () => {

				const probe = new Probe()

				$mol_assert_equal(probe.notes().length, 2)
				$mol_assert_equal(probe.viewer(), 'Tester')
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_notes'], 1)
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_viewer'], 1)

				$demo_graphql_fixture_typenames_like({ id: 'n1' }) // writes: ['Note']

				$mol_assert_equal(probe.notes()[0].likes, 1) // reads Note: refetched
				$mol_assert_equal(probe.viewer(), 'Tester')
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_notes'], 2)
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_viewer'], 1) // reads only User: untouched, no opt-out needed

			})
		},

		'by_typenames: an empty list still refetches on the first insert'($) {
			const { calls, transport } = graphql_mock([])
			with_transport(transport, () => {

				const probe = new Probe()

				// no Note ever appears in the DATA; the read set comes from the schema walk
				$mol_assert_equal(probe.notes().length, 0)
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_notes'], 1)

				$demo_graphql_fixture_typenames_like({ id: 'n1' }) // creates the first note

				$mol_assert_equal(probe.notes().length, 1)
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_notes'], 2)

			})
		},

		'by_typenames: @touches unions extra write types'($) {
			const { calls, transport } = graphql_mock(stock_notes())
			with_transport(transport, () => {

				const probe = new Probe()

				$mol_assert_equal(probe.viewer(), 'Tester')
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_viewer'], 1)

				$demo_graphql_fixture_typenames_touch({ id: 'n1' }) // @touches(types: ["User"]) => writes: ['Note', 'User']

				$mol_assert_equal(probe.viewer(), 'Tester')
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_viewer'], 2) // the declared side effect reached the User reader

			})
		},

		'by_typenames: revalidate:false still opts a mutation out'($) {
			const { calls, transport } = graphql_mock(stock_notes())
			with_transport(transport, () => {

				const probe = new Probe()

				$mol_assert_equal(probe.notes().length, 2)
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_notes'], 1)

				$demo_graphql_fixture_typenames_like({ id: 'n1' }, { revalidate: false }) // silent write

				$mol_assert_equal(probe.notes()[0].likes, 0) // stale on purpose
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_notes'], 1)

			})
		},

		'disable: wrappers never subscribe and never bump'($) {
			const { calls, transport } = graphql_mock(stock_notes())
			with_transport(transport, () => {

				const probe = new Probe()

				$mol_assert_equal(probe.viewer_disabled(), 'Tester')
				$mol_assert_equal(probe.notes().length, 2)
				$mol_assert_equal(calls['demo_graphql_fixture_disable_viewer'], 1)
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_notes'], 1)

				$demo_graphql_fixture_disable_like({ id: 'n1' }) // writes: [] - bumps nothing

				$mol_assert_equal(probe.viewer_disabled(), 'Tester')
				$mol_assert_equal(probe.notes()[0].likes, 0)
				$mol_assert_equal(calls['demo_graphql_fixture_disable_viewer'], 1)
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_notes'], 1) // even a Note reader stays put

				$demo_graphql_fixture_typenames_like({ id: 'n1' }) // bumps the Note marker

				$mol_assert_equal(probe.viewer_disabled(), 'Tester')
				$mol_assert_equal(calls['demo_graphql_fixture_disable_viewer'], 1) // reads: [] - subscribed to nothing

			})
		},

		'no metadata degrades to the universal marker, so mixed calls stay safe'($) {
			const { calls, transport } = graphql_mock(stock_notes())
			with_transport(transport, () => {

				const probe = new Probe()

				$mol_assert_equal(probe.notes().length, 2)
				$mol_assert_equal(probe.dumb().viewer.name, 'Tester')
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_notes'], 1)
				$mol_assert_equal(calls['Dumb'], 1)

				// a typed mutation must still refresh a metadata-less query (its reads are unknown)
				$demo_graphql_fixture_typenames_like({ id: 'n1' })

				$mol_assert_equal(probe.dumb().viewer.name, 'Tester')
				$mol_assert_equal(calls['Dumb'], 2)
				$mol_assert_equal(probe.notes()[0].likes, 1)
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_notes'], 2)

				// a metadata-less mutation must still refresh a typed query (its writes are unknown)
				$demo_graphql_request('mutation Bump { bump }')

				$mol_assert_equal(probe.notes().length, 2)
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_notes'], 3)

			})
		},

		'out-of-band revalidate refetches queries like a metadata-less mutation'($) {
			const { calls, transport } = graphql_mock(stock_notes())
			with_transport(transport, () => {

				const probe = new Probe()

				$mol_assert_equal(probe.notes().length, 2)
				$mol_assert_equal(probe.dumb().viewer.name, 'Tester')
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_notes'], 1)
				$mol_assert_equal(calls['Dumb'], 1)

				// what the live panel's watcher calls on every subscription event
				$demo_graphql_revalidate()

				$mol_assert_equal(probe.dumb().viewer.name, 'Tester')
				$mol_assert_equal(probe.notes().length, 2)
				$mol_assert_equal(calls['Dumb'], 2) // universal marker reader
				$mol_assert_equal(calls['demo_graphql_fixture_typenames_notes'], 2) // typed reader, via unknown_writes

			})
		},

	})

}
