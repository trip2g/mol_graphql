// Shared mock: in-memory data + resolvers.
// Used by the real mock server (index.mjs) AND bundled into the fallback
// in-browser executor (pages/mock.mjs). The canonical static entry
// (app/static/static.ts) mirrors this dataset by hand — keep them in sync.
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
			return note
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
