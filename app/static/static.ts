namespace $ {

	// $demo_app_static: the STATIC entry — $demo_app with an in-browser GraphQL
	// mock instead of a server. `mam demo/app/static` bundles it; the bundle's
	// index.html renders $demo_app; deploy `app/static/-` to any static host
	// (GitHub Pages) and the demo works with zero network dependencies.
	//
	// This module only swaps the transport seam ($demo_graphql_transport is an
	// `export let` read on every request — same swap the tests do). It answers
	// each operation by name from the same in-memory dataset as the real mock
	// server (server/mock.mjs); keep the two in sync by hand. Likes increment
	// statefully and reset on reload. Synchronous on purpose: the fiber runtime
	// expects the transport to return a value.

	/** Pulls the app into this bundle: the entry's index.html renders $demo_app. */
	export const $demo_app_static_root = () => $demo_app

	const users = [
		{ id: 'u1', name: 'Ada Lovelace' },
		{ id: 'u2', name: 'Alan Turing' },
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

	const note_data = (note: typeof notes[number]) => ({
		id: note.id,
		title: note.title,
		body: note.body,
		likes: note.likes,
		author: { name: users.find(user => user.id === note.author_id)!.name },
	})

	$demo_graphql_transport = (query, variables) => {

		const name = /^\s*(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? ''

		switch (name) {

			case 'demo_app_viewer':
				return { data: { viewer: { name: users[0].name } } }

			case 'demo_app_notes':
				return { data: { notes: notes.map(note_data) } }

			case 'demo_note_card_like': {
				const id = (variables as { id: string }).id
				const note = notes.find(note => note.id === id)
				if (!note) return { errors: [{ message: `Note ${id} not found` }] }
				note.likes += 1
				return { data: { note_like: { id: note.id, likes: note.likes } } }
			}

			default:
				return { errors: [{ message: `Unmocked operation: ${name}` }] }

		}

	}

}
