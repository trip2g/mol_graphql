namespace $ {

	// $demo_graphql_mock: the in-browser GraphQL mock. LINKING this module is
	// what activates it: the module body swaps the transport seam
	// ($demo_graphql_transport is an `export let` read on every request - the
	// same swap the tests do), so any entry that references this module gets
	// the mock, and any bundle that does not stays on the real server
	// transport. The Pages entry (pages/pages.ts) links it explicitly; the
	// real app (app/) never references it, so `mam demo/app` stays clean by
	// construction.
	//
	// The mock answers each operation by name from the same in-memory dataset
	// as the real mock server (server/mock.mjs); keep the two in sync by hand.
	// Likes increment statefully and reset on reload. Synchronous on purpose:
	// the fiber runtime expects the transport to return a value.

	const users = [
		{ id: 'u1', name: 'Ada Lovelace', pinned_note_id: 'n2' as string | null },
		{ id: 'u2', name: 'Alan Turing', pinned_note_id: null },
	]

	const notes = [
		{
			id: 'n1',
			title: 'Fragments the Relay way',
			body: 'Each component declares its data needs as a named fragment. Operations spread fragments by name.',
			likes: 3,
			author_id: 'u1',
		},
		{
			id: 'n2',
			title: 'Masking',
			body: 'The parent fetches the data but its TYPE hides fragment fields. Only the child that declared the fragment can unmask them.',
			likes: 1,
			author_id: 'u2',
		},
		{
			id: 'n3',
			title: 'No smart cache here',
			body: 'Every query refetches after a mutation via a reactive marker. Deliberately no normalized store.',
			likes: 0,
			author_id: 'u1',
		},
	]

	// Local analog of the server's subscription broadcast, for the zero-network
	// Pages build: the like mutation pushes the changed note to every open
	// note_liked "stream". Deferred by a macrotask, like a real network push,
	// so the emit never runs inside the mutation's own fiber.
	const note_liked_listeners = new Set<(data: unknown) => void>()

	const note_liked_emit = (note: typeof notes[number]) => {
		const data = { note_liked: note_data(note) }
		for (const next of [...note_liked_listeners]) next(data)
	}

	const note_data = (note: typeof notes[number]) => ({
		id: note.id,
		title: note.title,
		body: note.body,
		likes: note.likes,
		author: { name: users.find(user => user.id === note.author_id)!.name },
	})

	/** The mock transport: resolves each operation by name against the in-memory dataset. */
	export const $demo_graphql_mock = (query: string, variables?: object) => {

		const name = /^\s*(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? ''

		switch (name) {

			case 'demo_app_viewer': {
				const pinned = notes.find(note => note.id === users[0].pinned_note_id)
				return { data: { viewer: {
					name: users[0].name,
					pinned_note: pinned ? note_data(pinned) : null,
				} } }
			}

			case 'demo_app_notes':
				return { data: { notes: notes.map(note_data) } }

			case 'demo_note_card_like': {
				const id = (variables as { id: string }).id
				const note = notes.find(note => note.id === id)
				if (!note) return { errors: [{ message: `Note ${id} not found` }] }
				note.likes += 1
				setTimeout(() => note_liked_emit(note), 0)
				return { data: { note_like: { id: note.id, likes: note.likes } } }
			}

			default:
				return { errors: [{ message: `Unmocked operation: ${name}` }] }

		}

	}

	// the swap: importing this module replaces the server transport with the mock
	$demo_graphql_transport = $demo_graphql_mock

	// the same swap for the subscription stream: instead of an SSE connection,
	// events come from the local emitter above. The first await defers the
	// listener registration out of the fiber that pulled the stream up; the
	// "connection" then stays open until the host aborts it.
	$demo_graphql_subscription_connect = async (query, variables, events, signal) => {
		await Promise.resolve()
		if (signal.aborted) return

		if (!/\bnote_liked\b/.test(query)) {
			events.fail(new Error(`Unmocked subscription`))
			return
		}

		events.open()
		const listener = (data: unknown) => events.next(data)
		note_liked_listeners.add(listener)
		try {
			await new Promise<void>(done => signal.addEventListener('abort', () => done()))
		} finally {
			note_liked_listeners.delete(listener)
		}
	}

}
