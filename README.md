**[English](README.md)** · [Русский](README_ru.md)

# $mol + GraphQL codegen: Relay's fragment way, without React

A copy-paste-able starter showing how to wire **$mol** components to a GraphQL API with
**full end-to-end typing** and **Relay-style fragments**, declared per component,
spread by name, masked for everyone else, with zero imports and no changes to the
$mol/mam builder.

**Live demo:** https://trip2g.github.io/mol_graphql/ (runs entirely in the browser: the
`$demo_app_static` entry bundles the app together with an in-browser GraphQL mock, no
server; likes reset on reload).

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

This repo is the `demo` package of a [mam](https://github.com/hyoo-ru/mam) workspace
(the repo root mounts at `demo/`), so a repo path `app/...` is workspace path `demo/app/...`
and the generated symbols carry the `$demo_` prefix.

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
  # note/card/note.graphql
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
  # app/notes.graphql
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
  // note/card/card.view.ts
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
the static panel stays put ([`card.view.ts`](note/card/card.view.ts#L56-L69),
[`app.view.ts`](app/app.view.ts#L30-L60)).

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
   [`operationCode`](codegen/molplugin.js#L71-L104) merges spread fragments into the sent
   string and emits the typed wrapper; [`fragmentCode`](codegen/molplugin.js#L105-L118)
   emits the fragment type and `unmask`; [`escapeDollars`](codegen/molplugin.js#L67-L69) is
   the `$`-escape fix. [`codegen/preset.js`](codegen/preset.js) wires one output per file.
3. The generated output: [`app/notes.graphql.ts`](app/notes.graphql.ts#L13-L30) (masked
   query with the fragment merged in) and
   [`note/card/note.graphql.ts`](note/card/note.graphql.ts#L4-L13) (fragment type + `unmask`).
4. The runtime: [`graphql/index.ts`](graphql/index.ts): the
   [request layer and refetch convention](graphql/index.ts#L80-L135), the
   [invalidation markers](graphql/index.ts#L34-L68), the
   [opaque ref type](graphql/index.ts#L136-L148).
5. A component consuming a fragment: [`note/card/card.view.ts`](note/card/card.view.ts):
   [`note()` unmasks the ref](note/card/card.view.ts#L15-L17);
   [`renders()`](note/card/card.view.ts#L56-L69) is the counter that ticks on every refetch.
6. The opt-out in action: [`app/app.view.ts`](app/app.view.ts#L44-L60):
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
graphql/schema.graphql.ts   (generated) shared scalar/enum/input types
app/                    $demo_app: page, plain query + fragment-composing query
app/static/             $demo_app_static: static entry, app + in-browser mock transport
note/card/              $demo_note_card: fragment + unmask + typed mutation
pages/                  FALLBACK static-site assembly (esbuild + graphql-js executor)
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
| `npx mam demo/app/static` | build the static serverless entry into `demo/app/static/-/` |

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
mounts this repo as `package: 'demo'`), builds `demo/app` and `demo/app/static`, runs
every `*.test.ts`; then the `demo/app/static/-` folder is published to Pages. The
default `GITHUB_TOKEN` is enough: everything mam_build clones is public. The deployed
site is `$demo_app_static` ([`app/static/static.ts`](app/static/static.ts)): one bundle
where the transport seam is swapped for a sync in-browser mock answering each operation
from the same dataset as the mock server. Keep it in sync with
[`server/mock.mjs`](server/mock.mjs) by hand.

[`pages.yml`](.github/workflows/pages.yml) is the manual FALLBACK (pre-canonical) path:
mam build of `demo/app` + [`pages/build.mjs`](pages/build.mjs), which esbuild-bundles a
real graphql-js executor over the SDL ([`pages/mock.mjs`](pages/mock.mjs)). Delete it
(and `pages/`) once the canonical deploy is proven live.

## How to copy this into your project

1. Take `codegen/` as-is; point `schema` at your SDL file and `documents` at your UI
   tree; set `molRuntime` to your prefix (e.g. `$myapp_graphql`).
2. Port `graphql/index.ts` under your prefix (request fn, error, ref type,
   invalidation marker), or swap the body of `*_request` for your transport.
3. Write `.graphql` files next to your components: **one operation or fragment per
   file**; file path defines the generated symbol (`a/b/c.graphql` → `$a_b_c`);
   fragment names follow `${Component}_${prop}` and must be globally unique.
4. `npm run codegen:watch` next to your mam dev server. Generated `*.graphql.ts` can be
   committed (this repo does) so the app builds without running codegen first.

### Gotchas (learned the hard way)

- **$mol module paths are literal**: `$demo_note_card` must live at `demo/note/card/`
  in the workspace, i.e. `note/card/` in this repo. Underscore = directory separator,
  always. (The builder resolves dependency FQNs by exact path segments; that is also why
  the mount point `demo` and not e.g. `mol_graphql`: no underscores in path segments.)
- **The $mol dep scanner reads `$`-tokens everywhere**, including string literals and
  doc-comments. GraphQL variables (`$id`) and fragment-masking keys (`' $fragmentRefs'`)
  would become phantom module deps and fail the build. The codegen therefore escapes
  every `$` in emitted GraphQL strings and stock-plugin type output as `\u0024`
  (identical to TS/JS at both type and runtime level). If you hand-write such tokens in
  a module `.ts`, escape them the same way (see `graphql/index.ts`).
  Prior art avoided this by hand: adding empty stub directories named after the phantom
  tokens (`fragment/`, `id/`, ...) so the scanner resolves them to nothing. Escaping every
  `$` is the canonical fix: no stub dirs, and it survives new field/variable names
  automatically.
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
	$mol_assert_equal(calls.DemoAppNotes, 1)
	// mutate, then re-read, then assert the page queries refetched
})
```

What the tests prove:
- **Fragment unmask** (`card.view.test.ts`): a fragment ref unmasks into the typed fields and the
  card renders them. No network.
- **The refetch convention** (`app.view.test.ts`): after a like mutation, the page queries are
  re-requested (`DemoAppNotes` and `DemoAppViewer` call counts go 1 → 2) and the data changes.
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
