namespace $ {

	// $demo_pages: the GitHub Pages entry - a thin composition, no logic of its
	// own. `mam demo/pages` bundles it; the bundle's index.html renders
	// $demo_app; deploy `pages/-` to any static host (GitHub Pages) and the
	// demo works with zero network dependencies.
	//
	// The transport is chosen by LINKING, not by file placement: the reference
	// to $demo_graphql_mock below pulls the mock module into this bundle, and
	// that module's body swaps the transport seam. The real app (demo/app)
	// never references the mock, so its bundle keeps the server transport and
	// stays clean by construction.

	/** Pulls the app into this bundle: the entry's index.html renders $demo_app. */
	export const $demo_pages_root = () => $demo_app

	/** Links the in-browser mock into this bundle: its module body swaps the transport to the mock. */
	export const $demo_pages_transport = $demo_graphql_mock

}
