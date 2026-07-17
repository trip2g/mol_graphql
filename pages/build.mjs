// FALLBACK static-site assembly (the canonical path is the $demo_app_static
// module - see .github/workflows/deploy.yml). Assembles pages/dist/ from
// the mam-built bundle (app/-/) + the Pages index.html + the esbuild-bundled
// in-browser GraphQL executor. Run AFTER a mam build of demo/app.
// All asset URLs are relative, so the result works under the /mol_graphql/
// project-Pages subpath as-is.
import { cpSync, rmSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildSync } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'pages/dist')

rmSync(dist, { recursive: true, force: true })
cpSync(join(root, 'app/-'), dist, { recursive: true })

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
