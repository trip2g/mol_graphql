// Assemble the static GitHub Pages site into pages/dist/:
// the mam-built bundle (demo/app/-/) + the Pages index.html + the bundled
// in-browser GraphQL mock. Run AFTER `npm run build`.
// All asset URLs are relative, so the result works under the /mol_graphql/
// project-Pages subpath as-is.
import { cpSync, rmSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildSync } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'pages/dist')

rmSync(dist, { recursive: true, force: true })
cpSync(join(root, 'demo/app/-'), dist, { recursive: true })

// overwrite the bundle's index.html with the Pages variant (adds mock.js)
copyFileSync(join(root, 'pages/index.html'), join(dist, 'index.html'))

buildSync({
	entryPoints: [join(root, 'pages/mock.mjs')],
	bundle: true,
	format: 'iife',
	minify: true,
	loader: { '.graphql': 'text' },
	outfile: join(dist, 'mock.js'),
})

console.log(`Static site assembled: ${dist}`)
