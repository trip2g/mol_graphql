**[English](README.md)** · [Русский](README_ru.md)

# $mol + GraphQL codegen: Relay's fragment way, without React

You have a GraphQL API on one side and a $mol UI on the other. This repo shows the
shortest path between them: a component describes the data it needs in a small
`.graphql` file next to its code, a code generator turns that file into an ordinary
typed function, and the component calls that function and renders the result. Every
component declares its own data this way (the fragment idea, borrowed from Relay), so
one request fetches exactly what the whole page needs, and $mol re-renders the page
when the data changes. If you know neither $mol nor GraphQL, start with the
[walkthrough below](#walkthrough-from-a-query-to-a-rendered-page): it builds the whole
picture on the demo's real files.

In expert terms: a copy-paste-able starter showing how to wire **$mol** components to a GraphQL API with
**full end-to-end typing** and **Relay-style fragments**, declared per component,
spread by name, masked for everyone else, with zero imports and no changes to the
$mol/mam builder.

**Live demo:** https://trip2g.github.io/mol_graphql/ (runs entirely in the browser: the
`$demo_pages` entry links the in-browser GraphQL mock into the bundle alongside the
app, no server; likes reset on reload).

```sh
docker-compose up --build
# open http://localhost:8080  (mock GraphQL API is on http://localhost:4000/graphql)
```

You get a page that greets the viewer (plain typed query), lists notes (parent query
composing a child's fragment), and lets you like a note (typed mutation + reactive
refetch). Everything is typed from the schema down to the component code.

## Walkthrough: from a query to a rendered page

If you know neither $mol nor GraphQL, two facts are enough to read this section:

- A GraphQL query is a plain-text list of the fields you want; the server answers
  with JSON of exactly those fields. A fragment is a named, reusable piece of such
  a list.
- A $mol component is a folder with two files: `*.view.tree` declares what is on
  screen, `*.view.ts` adds behavior in TypeScript. A property declared in the tree
  can be computed or overridden in the `.ts`.

### Step 1: one query, one component

The app greets the current user. Its data need is written in
[`app/viewer.graphql`](app/viewer.graphql), a plain file next to the component:

```graphql
query {
	viewer {
		name
		pinned_note {
			...demo_note_card_note
		}
	}
}
```

Only `name` matters for now; the `pinned_note { ...demo_note_card_note }` part reuses
another component's fragment and will make sense after step 2.

The codegen watches this file and generates `app/viewer.graphql.ts` next to it: a
typed function named `$demo_app_viewer` after the file path. The component calls it
like any other function:

```ts
// app/app.view.ts
@ $mol_mem
greeting() {
	return `Reading list of ${$demo_app_viewer().viewer.name}`
}
```

There is no import and no fetch plumbing here: `$demo_app_viewer()` performs the
request, and `.viewer.name` is typed from the schema, so a typo in a field name is a
compile error. `@ $mol_mem` memoizes the property and makes it reactive: while the
response is in flight, $mol suspends this computation and replays it once the data
arrives; when the data later changes, everything that read it re-renders.

The tree file puts the text on screen:

```
$demo_app $mol_page
	title \$mol × GraphQL fragments
	body /
		<= Greeting $mol_paragraph
			title <= greeting \
```

That is the whole loop: a `.graphql` file describes the data, a generated typed
function fetches it, a one-line property renders it.

### Step 2: a catalog and its cards, tied by a ref

The page also shows a list of note cards. Two components are involved: the card
(`note/card`, the item) and the app (the catalog). Each declares only what it itself
needs.

The card states its data needs as a fragment in
[`note/card/note.graphql`](note/card/note.graphql):

```graphql
fragment demo_note_card_note on Note {
	id
	title
	body
	likes
	author {
		name
	}
}
```

Read it as: "to render one card of a `Note`, I need these fields". The card's tree
declares its layout and one input, `note_ref`:

```
$demo_note_card $mol_view
	note_ref null $demo_note_card_note_ref
	sub /
		<= Title $mol_paragraph
			title <= note_title \
		<= Body $mol_paragraph
			title <= note_body \
```

`note_ref` is not the data itself. It is an opaque reference (the
`$demo_note_card_note_ref` type is also generated from the fragment file). The card
turns the ref into its fields with a generated unmask helper and renders them:

```ts
// note/card/card.view.ts
@ $mol_mem
note() {
	return $demo_note_card_note_unmask_not_null(this.note_ref())
}

note_title() {
	return this.note().title
}

like_title() {
	return `♥ ${this.note().likes}`
}
```

The card never fetches anything. Whoever wants to show a card must hand it a ref,
and only the card can open that ref.

Now the catalog side. The app's page query in [`app/notes.graphql`](app/notes.graphql)
spreads the card's fragment by name:

```graphql
query DemoAppNotes {
	notes {
		id
		...demo_note_card_note
	}
}
```

`...demo_note_card_note` means "include here everything the card asked for". One
network request fetches the list ids plus every field every card needs. The app
itself owns only `id`: reading `notes()[0].title` in app code is a compile error,
because the card's fields are masked from everyone else.

The app renders one card per note and passes each card its ref, in the tree:

```
		<= Note_list $mol_list
			rows <= note_rows /
	Note_card* $demo_note_card
		note_ref <= card_ref* null
```

and in the behavior file:

```ts
// app/app.view.ts
@ $mol_mem
notes() {
	return $demo_app_notes().notes
}

@ $mol_mem
note_rows() {
	return this.notes().map(note => this.Note_card(note.id))
}

card_ref(id: string): $demo_note_card_note_ref {
	return this.notes().find(note => note.id === id)!
}
```

Follow the ref: the query result comes out of `$demo_app_notes()` typed and masked,
`note_rows()` makes a `Note_card` per id, the tree binding `note_ref <= card_ref*`
hands each card its own masked item, and the card's `note()` unmasks it. The
`pinned_note { ...demo_note_card_note }` from step 1 now reads naturally too: the
viewer query reuses the same card fragment for the pinned note.

### Step 3: a mutation that refreshes the page by itself

The like button changes data on the server. Like queries and fragments, the mutation
is a plain file next to the component, [`note/card/like.graphql`](note/card/like.graphql):

```graphql
mutation DemoNoteCardLike($id: ID!) {
	note_like(id: $id) {
		id
		likes
	}
}
```

The codegen turns it into the typed function `$demo_note_card_like`, and the card
calls it from its click handler:

```ts
// note/card/card.view.ts
like(next?: Event) {
	// calling this auto-reloads all queries on the page
	$demo_note_card_like({ id: this.note().id })
}
```

That comment is the demo's whole cache story (the default `revalidation: 'all'`
convention, detailed below): after any mutation, every query on the page refetches,
so the like count and anything else derived from the data update with no manual
cache work.

### Step 4: what you see, and why it is the shortest path

Open the page and it renders: the greeting with the viewer's name, the pinned-note
line, and one card per note with its title, body, author, and a like button showing
the live count. Click like: the typed mutation fires, the page queries refetch, and
every count on screen updates.

The payoff in one line: the catalog asks the server for exactly what its cards need,
in a single request; each card unmasks only its own fields; a mutation refreshes the
whole page by convention; and $mol re-renders whatever read the changed data. That is
the shortest path from a typed query to a rendered, reactive page.

The rest of this page is the reference: how the codegen works, what exactly it
generates, how to tune the refetch scope, and how to test it all.

## The idea in one paragraph

Each component module co-locates its GraphQL operations as separate `.graphql` files.
A watch codegen (`graphql-codegen` + ~150 lines of custom preset/plugin) generates a
`<name>.graphql.ts` next to each: a thin, fully-typed wrapper in the global
`namespace $`. The $mol builder (`mam`) then compiles those generated files as ordinary
module TypeScript. **Two builders meet through a file seam**: graphql-codegen writes
`.graphql.ts`, mam compiles it, exactly like `.view.tree` → `-view.tree/*.d.ts` works
in $mol itself. The generated symbol `$<module>_<opname>` appears in `namespace $`
with zero imports.

This repo is the `demo` package of a [mam](https://github.com/hyoo-ru/mam) workspace
(the repo root mounts at `demo/`), so a repo path `app/...` is workspace path `demo/app/...`
and the generated symbols carry the `$demo_` prefix.

| `.graphql` source | generated `.graphql.ts` | exported symbol |
|---|---|---|
| `app/notes.graphql` | `app/notes.graphql.ts` | `$demo_app_notes(): demo_app_notesQuery` |
| `app/viewer.graphql` | `app/viewer.graphql.ts` | `$demo_app_viewer(): demo_app_viewerQuery` |
| `note/card/note.graphql` | `note/card/note.graphql.ts` | `$demo_note_card_note` + `$demo_note_card_note_ref` + `$demo_note_card_note_unmask(ref)` + `$demo_note_card_note_unmask_not_null(ref)` |
| `note/card/like.graphql` | `note/card/like.graphql.ts` | `$demo_note_card_like(vars): demo_note_card_likeMutation` |

The result/variables types are **baked in by the generator** (it knows the schema and
the operation), so there is no reliance on byte-for-byte string-literal matching.

### Operations are auto-named from the file location

You may write `query { ... }` (anonymous) or `query AnyName { ... }`: the codegen
rewrites the operation name to the canonical one derived from the file path, which is
the generated symbol without the leading `$`. For `note/card/like.graphql` the symbol
is `$demo_note_card_like`, so the document actually sent is
`mutation demo_note_card_like(...)`. The function you call, the operation name the
server sees, and the file path match 1:1.

Two things fall out of this for free: server logs and APM always get a meaningful
operation name, even when the developer forgot to write one; and the usual
graphql-codegen "anonymous operation" error is gone (this repo's
[`app/viewer.graphql`](app/viewer.graphql) is anonymous on purpose). Fragments are NOT
renamed: they are spread by name across files (the Relay model), so a rewrite would
break the spread sites. Instead the codegen prints a non-blocking warning when a
fragment's name deviates from the same path-derived canonical, and this repo names its
fragments canonically (`note/card/note.graphql` declares `demo_note_card_note`).

## Fragments: Relay's model, $mol's style

This reproduces the [Relay fragment rendering model](https://relay.dev/docs/guided-tour/rendering/fragments/)
without React and without its normalized store:

- **A component declares its data needs as a named fragment** in its own `.graphql` file:

  ```graphql
  # note/card/note.graphql
  fragment demo_note_card_note on Note {
    id
    title
    body
    likes
    author { name }
  }
  ```

- **Fragments are global, spread by unique name.** They do not care about the component
  tree: any operation (or another fragment) can spread `...demo_note_card_note`. Fragment
  names follow the same path-derived canonical as operations: the file path naturally
  encodes component and prop (`note/card/note.graphql` -> `demo_note_card_note`), so
  global uniqueness comes from the path automatically. Unlike operations, the codegen
  only WARNS (does not reject or rewrite) when a fragment name deviates: GraphQL spreads
  are by-name and stay valid under any name. At codegen time the fragment definitions are merged
  (transitively) into every operation that spreads them, producing one network request with no
  runtime document registry:

  ```graphql
  # app/notes.graphql
  query DemoAppNotes {
    notes {
      id
      ...demo_note_card_note
    }
  }
  ```

- **Masking.** The parent physically receives the fragment's data, but its TYPE hides
  it. `$demo_app_notes().notes[0]` is typed as
  `{ id: string } & { ' $fragmentRefs'?: { demo_note_card_noteFragment } }`. Reading
  `.title` in the parent is a compile error:

  ```
  error TS2339: Property 'title' does not exist on type
  '{ __typename?: "Note"; id: string; } & { ' $fragmentRefs'?: ... }'
  ```

- **Unmask accessor instead of `useFragment`.** Relay's `useFragment` is really an
  identity cast, not a hook, so in $mol it is a plain generated function used inside
  a reactive `$mol_mem` property:

  ```ts
  // note/card/card.view.ts
  export class $demo_note_card extends $.$demo_note_card {

      @ $mol_mem
      note() {
          // checked unmask: the parent always binds a real ref (see below)
          return $demo_note_card_note_unmask_not_null(this.note_ref())
      }

      note_title() { return this.note().title }
  }
  ```

### Typing the ref in the .view.tree: `$<name>_ref`

Alongside the fragment type, each fragment file generates a bare-name alias for its
opaque ref:

```ts
// note/card/note.graphql.ts (generated)
export type $demo_note_card_note = demo_note_card_noteFragment
export type $demo_note_card_note_ref = $demo_graphql_ref<$demo_note_card_note>
```

The alias exists because a `.view.tree` property can carry a bare `$name` but not a
generic like `$demo_graphql_ref<...>`. So the card types its input ref right in the
tree, and needs no `.view.ts` type override at all:

```
$demo_note_card $mol_view
	note_ref null $demo_note_card_note_ref
```

mol properties are always nullable by default, so this generates
`note_ref(): $demo_note_card_note_ref | null` in the tree `.d.ts`. The parent binds
the ref as before (`note_ref <= card_ref*` in [`app/app.view.tree`](app/app.view.tree)).

### Two unmask helpers: nullability is preserved, never erased

The masked field's type already carries the schema's nullability, and unmask keeps it.
Each fragment generates two accessors, and the choice follows the schema:

- **`$<name>_unmask(ref)`** preserves the ref's nullability: a non-null ref yields the
  fragment, a `Ref | null` yields `Frag | null`, so the compiler forces you to handle
  the null branch. Use it for anything the schema can null: a nullable field, a null
  list element. The demo renders one: `User.pinned_note` is a nullable schema field,
  and the app shows a fallback:

  ```ts
  // app/app.view.ts
  @ $mol_mem
  pinned() {
      // Ref | null in, Frag | null out
      return $demo_note_card_note_unmask($demo_app_viewer().viewer.pinned_note)
  }

  pinned_title() {
      const note = this.pinned()
      if (!note) return 'No pinned note' // the compiler forces this branch
      return `Pinned: ${note.title} (♥ ${note.likes})`
  }
  ```

- **`$<name>_unmask_not_null(ref)`** is the checked accessor for values that are
  non-null by schema but arrive through a nullable seam (a tree-typed property is
  `| null` by default). On a null ref it throws a clear error naming the fragment;
  otherwise it returns the non-null fragment type. This is the safe replacement for
  TS `!`, which has no runtime check and lets a null crash later on some unrelated
  field access:

  ```ts
  // note/card/card.view.ts: list elements are non-null in the schema
  @ $mol_mem
  note() {
      return $demo_note_card_note_unmask_not_null(this.note_ref())
  }
  ```

Rule of thumb: nullable by schema, use `unmask` and handle the null; guaranteed
present, use `_unmask_not_null`, never `!`.

### Convention: a mutation refetches every query on the page

No normalized store, no cache-consistency machinery. Invalidation is one reactive marker
([`graphql/index.ts`](graphql/index.ts)): every query subscribes to a generation counter, every mutation
bumps it, so all `$mol_mem`-oized queries on the current page re-run. That is the whole
cache story, and you keep Relay's composition and masking ergonomics without it.

Yes, this fires some duplicate and overlapping requests. That is the deliberate trade: a
redundant fetch is cheaper than a UX bug from a forgotten invalidation callback, which is
the classic normalized-cache footgun. Don't fear the duplicates by default. Optimize only
when a real cost shows up.

When you do: pass `{ revalidate: false }` to `$demo_graphql_request` to opt one query out
of refetching, or one mutation out of triggering a refetch. On the backend, persisted
queries make the repeated reads cheap. The request layer and the unmask path stay small
and swappable, so smarter per-fragment reactivity via `$mol_mem` can land later without
touching generated code.

To watch this live, each note card shows a `renders` counter and there is a
`revalidate:false` static panel. Like any note: every card's counter ticks together while
the static panel stays put ([`card.view.ts`](note/card/card.view.ts#L52-L75),
[`app.view.ts`](app/app.view.ts#L50-L72)).

### $mol re-renders only what changed

The refetch convention sounds wasteful on the render side too, but it is not. Every
`$mol_mem` compares a recomputed value with the cached one structurally
(`$mol_compare_deep` inside the atom's `put`): if nothing changed, the atom keeps the
old value and never notifies subscribers, so the subtree behind that memo does not
re-render. A mutation refetches every query, but the DOM updates only where the data
actually differs.

The demo makes this visible. Every render region plays a short flash on re-render, like
"highlight updates" in React DevTools: a phase attribute alternates two values keyed off
the render counter, each value maps to its own copy of the same CSS keyframes, and the
changed animation-name restarts the pulse. Like a note and watch its card: the like
region flashes and its `renders` counter ticks, while the author region next to it stays
calm. Both hang off the same refetched query, but the author region is wired through a
memo ([`author_name()` in `card.view.ts`](note/card/card.view.ts#L27-L39)) that
recomputed to a structurally equal value, so `$mol_compare_deep` cut the propagation
right there. The redundant refetch costs a network roundtrip; the redundant re-render
never happens.

### Choosing the refetch scope: the `revalidation` codegen mode

How much a mutation refetches is a compile-time switch. One line in the plugin config
([`codegen/graphqlgen.js`](codegen/graphqlgen.js)) selects the invalidation metadata
baked into every generated wrapper:

```js
config: { molRuntime: '$demo_graphql', revalidation: 'all' } // 'all' | 'by_typenames' | 'disable'
```

- **`all`** (the default, and what this demo ships): the convention above. Every query
  subscribes to one universal marker, every mutation bumps it.
- **`by_typenames`**: the codegen walks each operation against the schema and bakes the
  resulting object-type set into the wrapper. A query subscribes to a per-type marker
  for each type it reads (`reads: ['Note', 'User']`); a mutation bumps the markers of
  the types in its response (`writes: ['Note']`). A like (writes `Note`) refetches the
  notes list (reads `Note`) but not a viewer query (reads only `User`), with no manual
  `{ revalidate: false }` needed for that isolation. And because the read set comes
  from the schema walk, not from runtime data, a query whose list came back empty still
  refetches when the first item appears (urql's document cache, which derives the same
  sets from runtime `__typename`s, misses that case).
- **`disable`**: wrappers never subscribe and never bump. Queries fetch once and
  recompute only when their own inputs change.

`{ revalidate: false }` keeps working in every mode and opts a single call out.
Operations without metadata (hand-written `$demo_graphql_request` calls) degrade to the
universal marker in any mode, so mixing them with generated wrappers stays safe.

You can enable `by_typenames` if your backend guarantees that every mutation returns,
in its own payload, all the object types that mutation affects. When that holds, the
computed write set (the types in the mutation's response) equals the real affected set,
per-type invalidation is exact, and you do not need `@touches`. A mutation whose
payload contains no object type at all (a delete returning `Boolean`) falls back to
the universal marker automatically: unknown effect, assume everything. The dangerous
case is a mutation that returns one type but also changes another, like a like that
also bumps a per-user counter. Either include the changed type in the payload or
declare it:

```graphql
mutation DemoFixtureTouch($id: ID!) @touches(types: ["User"]) {
  note_like(id: $id) { id likes }
}
```

The codegen unions the declared types into `writes` and strips the directive from the
document it sends. The honest caveat: nothing forces the author of a side-effectful
mutation to remember that declaration, and a forgotten `@touches` means silently stale
data. That failure mode is exactly the "forgotten invalidation callback" this page's
convention was designed to make impossible, which is why the safe default stays `'all'`.

The other two modes are proven by tests rather than by the shipped page:
[`graphql/index.test.ts`](graphql/index.test.ts) drives wrappers generated in
`by_typenames` and `disable` mode ([`graphql/fixture/`](graphql/fixture/)) against a
mock transport and asserts the selective refetch, the empty-list case, `@touches`, and
the no-metadata degradation.

## Where to look (reading path)

Follow these in order to see the whole idea, from a `.graphql` file to a running component:

1. A component's own operations: [`app/notes.graphql`](app/notes.graphql) and
   [`note/card/note.graphql`](note/card/note.graphql). Plain files next to the component.
2. The codegen that types them: [`codegen/molplugin.js`](codegen/molplugin.js):
   [`renameOperations`](codegen/molplugin.js#L107-L119) rewrites the operation name to the
   path-derived canonical; [`operationCode`](codegen/molplugin.js#L121-L161) merges spread
   fragments into the sent string and emits the typed wrapper;
   [`fragmentCode`](codegen/molplugin.js#L245-L283) emits the fragment type, the ref alias and both `unmask` helpers;
   [`escapeDollars`](codegen/molplugin.js#L101-L103) is
   the `$`-escape fix. [`codegen/preset.js`](codegen/preset.js) wires one output per file.
3. The generated output: [`app/notes.graphql.ts`](app/notes.graphql.ts#L13-L30) (masked
   query with the fragment merged in) and
   [`note/card/note.graphql.ts`](note/card/note.graphql.ts#L4-L28) (fragment type + ref alias + unmask helpers).
4. The runtime: [`graphql/index.ts`](graphql/index.ts): the
   [request layer and refetch convention](graphql/index.ts#L80-L135), the
   [invalidation markers](graphql/index.ts#L34-L68), the
   [opaque ref type](graphql/index.ts#L136-L148).
5. A component consuming a fragment: [`note/card/card.view.ts`](note/card/card.view.ts):
   [`note()` unmasks the ref](note/card/card.view.ts#L14-L17);
   [`renders()`](note/card/card.view.ts#L52-L75) is the counter that ticks on every refetch.
6. The opt-out in action: [`app/app.view.ts`](app/app.view.ts#L50-L72):
   `viewer_static()` passes `{ revalidate: false }`, so its counter never moves.

## Project layout

The repo is a **mam package** in the canonical [hyoo-ru](https://github.com/hyoo-ru)
shape: no vendored builder bootstrap, just module files. A mam workspace (cloned from
[hyoo-ru/mam](https://github.com/hyoo-ru/mam), which provides `mam.ts`/`tsconfig.json`
and the namespace→repo map for `mol`/`node`) mounts this repo at `demo/`. That is what
[hyoo-ru/mam_build](https://github.com/hyoo-ru/mam_build) does in CI with
`package: 'demo'`.

```
codegen/
  graphqlgen.js         graphql-codegen config (checked-in SDL, no introspection)
  preset.js             one output per .graphql file + shared schema types
  molplugin.js          typed wrappers + fragment unmask helpers, in namespace $
server/
  schema.graphql        the SDL: single source of truth for server AND codegen
  index.mjs             graphql-yoga mock server with in-memory data
graphql/index.ts        runtime: request fn, error, reactive marker, ref type
graphql/mock/           $demo_graphql_mock: in-browser mock; linking it swaps the transport
graphql/schema.graphql.ts   (generated) shared scalar/enum/input types
app/                    $demo_app: page, plain query + fragment-composing query
pages/                  $demo_pages: thin Pages entry, links the app + the mock
note/card/              $demo_note_card: fragment + unmask + typed mutation
package.json            DEV TOOL only: codegen + mock server (not part of the build)
```

## Commands

Local dev happens inside a mam workspace:

```sh
git clone https://github.com/hyoo-ru/mam.git mam-ws && cd mam-ws
git clone https://github.com/trip2g/mol_graphql.git demo
npm install
```

| command (from the workspace root) | what |
|---|---|
| `npm start` | mam dev server on :9080 (`/demo/app/`); run the mock server alongside |
| `npx mam demo/app` | one-shot production build into `demo/app/-/` (type-checks the bundle, runs tests) |
| `npx mam demo/pages` | build the serverless Pages entry into `demo/pages/-/` |

| command (from `demo/`, this repo) | what |
|---|---|
| `docker-compose up --build` | mock GraphQL API on :4000 + built app on :8080 |
| `npm install && npm run codegen` | regenerate all `*.graphql.ts` |
| `npm run codegen:watch` | regenerate on every .graphql/schema change |
| `npm run server` | run the mock GraphQL server locally |

The dev loop is `npm run codegen:watch` + `npm run server` (both in `demo/`) + `npm start`
(workspace root) in three terminals. The mam builder picks up regenerated `.graphql.ts`
like any source change.

## Build & deploy (GitHub Pages)

[`deploy.yml`](.github/workflows/deploy.yml) is the canonical hyoo-ru pipeline:
`hyoo-ru/mam_build@master2` assembles the workspace (clones `hyoo-ru/mam` + deps,
mounts this repo as `package: 'demo'`), builds `demo/app` and `demo/pages`, runs
every `*.test.ts`; then the `demo/pages/-` folder is published to Pages. The
default `GITHUB_TOKEN` is enough: everything mam_build clones is public. The deployed
site is `$demo_pages` ([`pages/pages.ts`](pages/pages.ts)): a thin entry that renders
the app and explicitly links `$demo_graphql_mock`
([`graphql/mock/mock.ts`](graphql/mock/mock.ts)). That link is the whole transport
choice - composition, not a file-placement trick: the mock module's body swaps the
transport seam for a sync in-browser mock answering each operation from the same
dataset as the mock server, while `demo/app`, which never references the mock, keeps
the server transport. Keep the dataset in sync with
[`server/mock.mjs`](server/mock.mjs) by hand.

## How to copy this into your project

1. Take `codegen/` as-is; point `schema` at your SDL file and `documents` at your UI
   tree; set `molRuntime` to your prefix (e.g. `$myapp_graphql`).
2. Port `graphql/index.ts` under your prefix (request fn, error, ref type,
   invalidation marker), or swap the body of `*_request` for your transport.
3. Write `.graphql` files next to your components: **one operation or fragment per
   file**; file path defines the generated symbol (`a/b/c.graphql` → `$a_b_c`) and the
   operation name (`a_b_c`, whatever you wrote in the file, even nothing);
   name fragments by their file path too (same `a_b_c` rule), which is globally
   unique automatically; the codegen warns if you deviate.
4. `npm run codegen:watch` next to your mam dev server. Generated `*.graphql.ts` can be
   committed (this repo does) so the app builds without running codegen first.

### Gotchas (learned the hard way)

- **$mol module paths are literal**: `$demo_note_card` must live at `demo/note/card/`
  in the workspace, i.e. `note/card/` in this repo. Underscore = directory separator,
  always. (The builder resolves dependency FQNs by exact path segments; that is also why
  the mount point `demo` and not e.g. `mol_graphql`: no underscores in path segments.)
- **The $mol dep scanner reads `$`-tokens everywhere**, including string literals and
  doc-comments; emitted non-module `$` is escaped as `\u0024`. Full story - the escape,
  why the server never sees it, and the comment-token trap - in
  [The `$` dependency scanner](#the--dependency-scanner) below.
- **`mam.ts`/`mam.jam.js` must exist at the workspace root** (they declare `class $`);
  without them every `$`-as-type use in mol fails to compile. In the canonical layout
  they come from the central [hyoo-ru/mam](https://github.com/hyoo-ru/mam) workspace.
  a package repo like this one must NOT vendor its own.
- The generated wrapper for an operation that spreads fragments carries a
  `/** Spreads fragments: $demo_note_card_note */` doc-comment; that is a real
  dependency edge for the builder (fragments are independent of the view hierarchy,
  so nothing else would link the fragment's module into the bundle).
- The app calls `http://localhost:4000/graphql` (see `$demo_graphql_endpoint`, 
  override it for other setups). CORS is open on the mock server.

## The `$` dependency scanner

The $mol builder does not parse code to find a module's dependencies. It scans the
source TEXT for `$`-prefixed names and resolves each one to a file - everywhere,
including string literals and doc-comments. This repo leans on that deliberately:
the generated `/** Spreads fragments: $demo_note_card_note */` doc-comment is a real
dependency edge that links the fragment's module into the bundle. The flip side is
that every stray `$`-token in source text is a build input, intended or not.

### Escape emitted `$` that is not a module, as `\u0024`

GraphQL query variables (`$id`) and fragment-masking keys (`' $fragmentRefs'`,
`' $fragmentName'`) carry a `$` that is not a $mol module. If the scanner sees them,
it resolves phantom modules and the build fails. So the codegen writes every such `$`
as `\u0024`: [`escapeDollars`](codegen/molplugin.js#L101-L103) for type output,
`escapeTemplate` for the embedded query strings, both in
[`codegen/molplugin.js`](codegen/molplugin.js). Real module references the codegen
DOES want as dependencies (`$demo_note_card_note`) stay unescaped on purpose. If you
hand-write such non-module tokens in a module `.ts`, escape them the same way (this
repo's [`graphql/index.ts`](graphql/index.ts) does, for the masking keys).

Prior art avoided the phantom modules by hand: empty stub directories named after
the phantom tokens (`fragment/`, `id/`, ...) so the scanner resolves them to nothing.
Escaping is the canonical fix: no stub dirs, and it survives new field and variable
names automatically.

### `\u0024` is safe - and the server never sees it

`\u0024` is a compile-time unicode escape. TS and JS decode it to U+0024 = `$` when the
string literal is parsed, so the generated types and the RUNTIME query strings are
identical in meaning to writing `$`. The escape exists only in the raw source text
(six ASCII characters, no `$` byte) to hide the token from the textual scanner. At
runtime the query string carries a real `$`, so the network payload and the GraphQL
server receive normal GraphQL. Concretely: the Like mutation is sent as
`mutation demo_note_card_like($id: ID!)` - a real `$` in the POST body - and the
server answers normally. The server never sees `\u0024`.

### The comment-token trap (a real bug this repo hit)

The same rule bites hand-written modules. A comment in
[`graphql/index.ts`](graphql/index.ts) once named the in-browser mock module by its
live symbol. Because `graphql/index.ts` is a real dependency of the app,
that one comment token pulled the whole in-browser mock into the production app
bundle: the app rendered mock data and never called the server. The fix is NOT to
escape here - a comment is prose, not code that needs the character - but to DROP
the `$`: the comment now names the mock in words, "the mock module
(graphql/mock/mock.ts)", instead of the live symbol. The flip side of the same rule
is what the Pages entry does on purpose: `$demo_pages_transport = $demo_graphql_mock`
is a real code reference, so the mock links into THAT bundle by explicit choice. If a
comment names a module you do not want linked, do not write it as a live `$`-token.

### The rule

The scanner treats every `$`-token in source text as a dependency. Two tools:
escape (`\u0024`) tokens that must keep the character but are not modules; name modules
you do not want linked without the `$` (in words, by file path).

## Testing query/mutation components

$mol tests live next to the code: [`card.view.test.ts`](note/card/card.view.test.ts),
[`app.view.test.ts`](app/app.view.test.ts). They use `$mol_test` + `$mol_assert`, and
every mam build runs every `*.test.ts` (it compiles them into `demo/app/-/node.test.js` and
runs it; a failing test fails the build). Run just the bundle with
`node --enable-source-maps demo/app/-/node.test.js` from the workspace root.

GraphQL components are tested with NO server by mocking the transport seam. `$demo_graphql_transport`
is a namespace `export let`, so a test reassigns it to a mock that counts calls per operation and
answers from a tiny in-memory store, then restores it in `finally`:

```ts
// app/app.view.test.ts (sketch)
const { calls, transport } = graphql_mock()          // per-operation call counter + in-memory store
with_transport(transport, () => {
	const app = $demo_app.make({ $ })
	$mol_assert_equal(app.greeting(), 'Reading list of Ada Lovelace')
	$mol_assert_equal(calls.demo_app_notes, 1)
	// mutate, then re-read, then assert the page queries refetched
})
```

What the tests prove:
- **Fragment unmask** (`card.view.test.ts`): a fragment ref unmasks into the typed fields and the
  card renders them; a null ref stays null through `unmask` and makes `unmask_not_null` throw with
  the fragment's name. No network.
- **The nullable field** (`app.view.test.ts`): a present `pinned_note` renders the pinned panel,
  a null one renders the fallback text.
- **The refetch convention** (`app.view.test.ts`): after a like mutation, the page queries are
  re-requested (`demo_app_notes` and `demo_app_viewer` call counts go 1 → 2) and the data changes.
- **The re-render gate** (`app.view.test.ts`): across a like, the like region's render probe
  advances while the author region's stays put, in the liked card and in the untouched one:
  `$mol_compare_deep` stops the propagation at the unchanged memos.
- **The opt-out** (`app.view.test.ts`): a `{ revalidate: false }` query is fetched exactly once
  across a mutation, and a `{ revalidate: false }` mutation leaves the page queries put.

Worth knowing:
- The mock transport is synchronous (same contract as the Pages mock), so cases are plain sync
  functions. Reading a `$mol_mem` in a test just computes it.
- Refetch is lazy: a mutation marks the page-query cells stale but nothing recomputes until the next
  read, so assert query counts AFTER re-reading.
- `$mol_mem` skips deep-equal recomputes, so a stateful mock (likes actually increment) is needed for
  a re-render to be observable.
- The per-case isolated `$` cannot intercept the transport (free functions read the global `$`), so
  the mock is a global swap restored in `finally`. That is leak-proof because $mol runs cases
  sequentially.

## What's mocked / simplified

- The GraphQL server is graphql-yoga with fixed in-memory data (likes actually
  increment server-side).
- No subscriptions, no persisted queries, no normalized cache (see above).
- `type-check evidence`: the mam build itself type-checks the exact bundle program
  (its audit fails the build on any TS error). A whole-workspace `tsc -p .` also
  drags in mol's unbuilt demo modules, so expect noise there; the bundle audit is the
  real gate.

## Further reading

The fragment model here follows Relay's, without its runtime store. The philosophy:
components own their data requirements, declared next to the code that uses them.

- [Relay: Thinking in Relay](https://relay.dev/docs/principles-and-architecture/thinking-in-relay/).
  Why each component declares its own data as a fragment and composes them.
- [Relay: Guided tour, rendering fragments](https://relay.dev/docs/guided-tour/rendering/fragments/).
  The exact rendering and masking model this demo reproduces.
- [Relay: Thinking in GraphQL](https://relay.dev/docs/principles-and-architecture/thinking-in-graphql/).
  The data-fetching philosophy behind it.
- [urql: Document caching](https://commerce.nearform.com/open-source/urql/docs/basics/document-caching/).
  A lighter cache than Relay's normalized store, closer to the "just refetch" choice here.
- [Павел Черторогов: ApolloClient или Relay с фрагментами (YouTube, RU)](https://www.youtube.com/watch?v=VdoPraj0QqU).
  Fragments, "hairy" GraphQL, and TypeScript.
