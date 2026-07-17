// Shared mock: in-memory data + resolvers.
// Used by the real mock server (index.mjs). The canonical in-browser mock
// (graphql/mock/mock.ts) mirrors this dataset by hand - keep them in sync.
export const users = [
	{ id: 'u1', name: 'Ada Lovelace', pinned_note_id: 'n2' },
	{ id: 'u2', name: 'Alan Turing', pinned_note_id: null },
]

export const notes = [
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

// Subscription plumbing: every note_like broadcasts the changed note to every
// live note_liked stream. One entry per open SSE connection.
const note_liked_listeners = new Set()

// One live stream per subscribe call: a push queue bridged to an async
// iterator. graphql-yoga turns it into SSE events natively.
function note_liked_stream() {
	const queue = []
	let wake = null
	const publish = note => {
		queue.push(note)
		if (wake) {
			wake()
			wake = null
		}
	}
	note_liked_listeners.add(publish)
	return {
		[Symbol.asyncIterator]() { return this },
		async next() {
			while (!queue.length) await new Promise(resolve => { wake = resolve })
			return { value: queue.shift(), done: false }
		},
		async return(value) {
			note_liked_listeners.delete(publish)
			return { value, done: true }
		},
	}
}

export const resolvers = {
	Query: {
		viewer: () => users[0],
		notes: () => notes,
	},
	Mutation: {
		note_like: (_root, { id }) => {
			const note = notes.find(note => note.id === id)
			if (!note) throw new Error(`Note ${id} not found`)
			note.likes += 1
			for (const publish of [...note_liked_listeners]) publish(note)
			return note
		},
	},
	Subscription: {
		note_liked: {
			subscribe: () => note_liked_stream(),
			resolve: note => note,
		},
	},
	Note: {
		author: note => users.find(user => user.id === note.author_id),
	},
	User: {
		// nullable on purpose: the app must handle a viewer with no pinned note
		pinned_note: user => notes.find(note => note.id === user.pinned_note_id) ?? null,
	},
}
