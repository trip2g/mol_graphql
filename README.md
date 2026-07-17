# $mol + GraphQL codegen: Relay's fragment way, without React

A copy-paste-able starter showing how to wire **$mol** components to a GraphQL API with
**full end-to-end typing** and **Relay-style fragments**, declared per component,
spread by name, masked for everyone else, with zero imports and no changes to the
$mol/mam builder.

**Live demo:** https://trip2g.github.io/mol_graphql/ (runs entirely in the browser: a
static build with an in-browser GraphQL mock, no server).

```sh
docker-compose up --build
# open http://localhost:8080  (mock GraphQL API is on http://localhost:4000/graphql)
```

You get a page that greets the viewer (plain typed query), lists notes (parent query
composing a child's fragment), and lets you like a note (typed mutation + reactive
refetch). Everything is typed from the schema down to the component code.

## The idea in one paragraph

Each component module co-locates its GraphQL operations as separate `.graphql` files.
A watch codegen (`graphql-codegen` + ~150 lines of custom preset/plugin) generates a
`<name>.graphql.ts` next to each: a thin, fully-typed wrapper in the global
`namespace $`. The $mol builder (`mam`) then compiles those generated files as ordinary
module TypeScript. **Two builders meet through a file seam**: graphql-codegen writes
`.graphql.ts`, mam compiles it, exactly like `.view.tree` → `-view.tree/*.d.ts` works
in $mol itself. The generated symbol `$<module>_<opname>` appears in `namespace $`
with zero imports.

Paths below are relative to `demo/`.

| `.graphql` source | generated `.graphql.ts` | exported symbol |
|---|---|---|
| `app/notes.graphql` | `app/notes.graphql.ts` | `$demo_app_notes(): DemoAppNotesQuery` |
| `app/viewer.graphql` | `app/viewer.graphql.ts` | `$demo_app_viewer(): DemoAppViewerQuery` |
| `note/card/note.graphql` | `note/card/note.graphql.ts` | `$demo_note_card_note` + `$demo_note_card_note_unmask(ref)` |
| `note/card/like.graphql` | `note/card/like.graphql.ts` | `$demo_note_card_like(vars): DemoNoteCardLikeMutation` |

The result/variables types are **baked in by the generator** (it knows the schema and
the operation), so there is no reliance on byte-for-byte string-literal matching.

## Fragments: Relay's model, $mol's style

This reproduces the [Relay fragment rendering model](https://relay.dev/docs/guided-tour/rendering/fragments/)
without React and without its normalized store:

- **A component declares its data needs as a named fragment** in its own `.graphql` file:

  ```graphql
  # demo/note/card/note.graphql
  fragment DemoNoteCard_note on Note {
    id
    title
    body
    likes
    author { name }
  }
  ```

- **Fragments are global, spread by unique name.** They do not care about the component
  tree: any operation (or another fragment) can spread `...DemoNoteCard_note`. The
  `${Component}_${prop}` naming convention exists only to guarantee global uniqueness
  (the codegen rejects duplicates). At codegen time the fragment definitions are merged
  (transitively) into every operation that spreads them, producing one network request with no
  runtime document registry:

  ```graphql
  # demo/app/notes.graphql
  query DemoAppNotes {
    notes {
      id
      ...DemoNoteCard_note
    }
  }
  ```

- **Masking.** The parent physically receives the fragment's data, but its TYPE hides
  it. `$demo_app_notes().notes[0]` is typed as
  `{ id: string } & { ' $fragmentRefs'?: { DemoNoteCard_noteFragment } }`. Reading
  `.title` in the parent is a compile error:

  ```
  error TS2339: Property 'title' does not exist on type
  '{ __typename?: "Note"; id: string; } & { ' $fragmentRefs'?: ... }'
  ```

- **Unmask accessor instead of `useFragment`.** Relay's `useFragment` is really an
  identity cast, not a hook, so in $mol it is a plain generated function used inside
  a reactive `$mol_mem` property:

  ```ts
  // demo/note/card/card.view.ts
  export class $demo_note_card extends $.$demo_note_card {

      // opaque ref bound by the parent in view.tree: `note_ref <= card_ref*`
      note_ref(): $demo_graphql_ref<$demo_note_card_note> {
          return super.note_ref()
      }

      @ $mol_mem
      note() {
          return $demo_note_card_note_unmask(this.note_ref()) // typed fields, only here
      }

      note_title() { return this.note().title }
  }
  ```

### Convention: a mutation refetches every query on the page

No normalized store, no cache-consistency machinery. Invalidation is one reactive marker
(`demo/graphql/index.ts`): every query subscribes to a generation counter, every mutation
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
the static panel stays put ([`card.view.ts`](demo/note/card/card.view.ts#L56-L69),
[`app.view.ts`](demo/app/app.view.ts#L30-L60)).

## Where to look (reading path)

Follow these in order to see the whole idea, from a `.graphql` file to a running component:

1. A component's own operations: [`app/notes.graphql`](demo/app/notes.graphql) and
   [`note/card/note.graphql`](demo/note/card/note.graphql). Plain files next to the component.
2. The codegen that types them: [`codegen/molplugin.js`](codegen/molplugin.js):
   [`operationCode`](codegen/molplugin.js#L71-L104) merges spread fragments into the sent
   string and emits the typed wrapper; [`fragmentCode`](codegen/molplugin.js#L105-L118)
   emits the fragment type and `unmask`; [`escapeDollars`](codegen/molplugin.js#L67-L69) is
   the `$`-escape fix. [`codegen/preset.js`](codegen/preset.js) wires one output per file.
3. The generated output: [`app/notes.graphql.ts`](demo/app/notes.graphql.ts#L13-L30) (masked
   query with the fragment merged in) and
   [`note/card/note.graphql.ts`](demo/note/card/note.graphql.ts#L4-L13) (fragment type + `unmask`).
4. The runtime: [`demo/graphql/index.ts`](demo/graphql/index.ts): the
   [request layer and refetch convention](demo/graphql/index.ts#L35-L69), the
   [generation marker](demo/graphql/index.ts#L26-L33), the
   [opaque ref type](demo/graphql/index.ts#L69-L71).
5. A component consuming a fragment: [`note/card/card.view.ts`](demo/note/card/card.view.ts):
   [`note()` unmasks the ref](demo/note/card/card.view.ts#L15-L17);
   [`renders()`](demo/note/card/card.view.ts#L56-L69) is the counter that ticks on every refetch.
6. The opt-out in action: [`app/app.view.ts`](demo/app/app.view.ts#L44-L60):
   `viewer_static()` passes `{ revalidate: false }`, so its counter never moves.

## Project layout

```
.meta.tree              namespace -> git repo mapping for the mam builder (mol, node)
mam.ts / mam.jam.js     $mol workspace bootstrap (declares `class $`; from hyoo-ru/mam)
tsconfig.json           workspace tsconfig (the mam type-checker reads compilerOptions from it)
codegen/
  graphqlgen.js         graphql-codegen config (schema = checked-in SDL, no live introspection)
  preset.js             custom preset: one output per .graphql file + shared schema types
  molplugin.js          emits the typed wrappers / fragment unmask helpers in namespace $
server/
  schema.graphql        the SDL: single source of truth for server AND codegen
  index.mjs             graphql-yoga mock server with in-memory data
demo/
  graphql/index.ts      runtime: $demo_graphql_request, error type, reactive marker, ref type
  graphql/schema.graphql.ts   (generated) shared scalar/enum/input types
  app/                  $demo_app: page, plain query + fragment-composing query
  note/card/            $demo_note_card: fragment + unmask + typed mutation
```

## Commands

| command | what |
|---|---|
| `docker-compose up --build` | mock GraphQL API on :4000 + built app on :8080 |
| `npm install && npm run codegen` | regenerate all `*.graphql.ts` |
| `npm run codegen:watch` | regenerate on every .graphql/schema change |
| `npm start` | mam dev server on :9080 (`/demo/app/`); run `npm run server` alongside |
| `npm run build` | one-shot production build into `demo/app/-/` (type-checks the bundle) |
| `npm run server` | run the mock GraphQL server locally |

The dev loop is `npm run codegen:watch` + `npm start` + `npm run server` in three
terminals. The mam builder picks up regenerated `.graphql.ts` like any source change.

## How to copy this into your project

1. Take `codegen/` as-is; point `schema` at your SDL file and `documents` at your UI
   tree; set `molRuntime` to your prefix (e.g. `$myapp_graphql`).
2. Port `demo/graphql/index.ts` under your prefix (request fn, error, ref type,
   invalidation marker), or swap the body of `*_request` for your transport.
3. Write `.graphql` files next to your components: **one operation or fragment per
   file**; file path defines the generated symbol (`a/b/c.graphql` → `$a_b_c`);
   fragment names follow `${Component}_${prop}` and must be globally unique.
4. `npm run codegen:watch` next to your mam dev server. Generated `*.graphql.ts` can be
   committed (this repo does) so the app builds without running codegen first.

### Gotchas (learned the hard way)

- **$mol module paths are literal**: `$demo_note_card` must live at `demo/note/card/`.
  Underscore = directory separator, always. (The builder resolves dependency FQNs by
  exact path segments.)
- **The $mol dep scanner reads `$`-tokens everywhere**, including string literals and
  doc-comments. GraphQL variables (`$id`) and fragment-masking keys (`' $fragmentRefs'`)
  would become phantom module deps and fail the build. The codegen therefore escapes
  every `$` in emitted GraphQL strings and stock-plugin type output as `\u0024`
  (identical to TS/JS at both type and runtime level). If you hand-write such tokens in
  a module `.ts`, escape them the same way (see `demo/graphql/index.ts`).
  Prior art avoided this by hand: adding empty stub directories named after the phantom
  tokens (`fragment/`, `id/`, …) so the scanner resolves them to nothing. Escaping every
  `$` is the canonical fix: no stub dirs, and it survives new field/variable names
  automatically.
- **`mam.ts`/`mam.jam.js` must exist at the workspace root** (they declare `class $`);
  without them every `$`-as-type use in mol fails to compile.
- The generated wrapper for an operation that spreads fragments carries a
  `/** Spreads fragments: $demo_note_card_note */` doc-comment; that is a real
  dependency edge for the builder (fragments are independent of the view hierarchy,
  so nothing else would link the fragment's module into the bundle).
- The app calls `http://localhost:4000/graphql` (see `$demo_graphql_endpoint`, 
  override it for other setups). CORS is open on the mock server.

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
