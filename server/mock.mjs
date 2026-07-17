// Shared mock: in-memory data + resolvers.
// Used by the real mock server (index.mjs) AND bundled into the in-browser
// executor for the static GitHub Pages build (pages/mock.mjs).
export const users = [
	{ id: 'u1', name: 'Ada Lovelace' },
	{ id: 'u2', name: 'Alan Turing' },
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
}
