namespace $.$$ {

	// The test IS the server: the connect seam is swapped for a stub that only
	// captures the events sink, and the case pushes subscription events by hand.
	// Same global-swap-restore discipline as the transport mock in
	// app/app.view.test.ts. The panel gets a PRIVATE host (subscription()
	// override in make) instead of the shared registry one, so no stream state
	// leaks between cases.

	function with_connect<Result>(
		connect: typeof $demo_graphql_subscription_connect,
		action: () => Result,
	): Result {
		const orig = $demo_graphql_subscription_connect
		$demo_graphql_subscription_connect = connect
		try {
			return action()
		} finally {
			$demo_graphql_subscription_connect = orig
		}
	}

	// captures the events sink synchronously: the host launches the stream on
	// the first data() read, and the connect body runs up to its first await
	function connect_probe() {
		const captured: { events: $demo_graphql_subscription_events | null } = { events: null }
		const connect: typeof $demo_graphql_subscription_connect = async (query, variables, events, signal) => {
			captured.events = events
			await new Promise<void>(done => signal.addEventListener('abort', () => done()))
		}
		return { captured, connect }
	}

	$mol_test({

		'subscription events flow into the panel and count up'($) {
			const { captured, connect } = connect_probe()
			with_connect(connect, () => {

				const host = new $demo_graphql_subscription_host()
				const live = $demo_note_live.make({ $, subscription: () => host })

				// no events yet: reading the panel spins the stream up
				$mol_assert_equal(live.last_title(), 'No likes seen yet: like a note, in another tab too')
				$mol_assert_equal(live.status_title(), 'Live (SSE): connecting / events: 0')
				$mol_assert_ok(captured.events) // the stream was opened by the read above

				captured.events!.open()
				captured.events!.next({ note_liked: { id: 'n1', title: 'First', likes: 4 } })

				$mol_assert_equal(live.last_title(), 'Someone liked "First" (n1), now 4 likes')
				$mol_assert_equal(live.status_title(), 'Live (SSE): connected / events: 1')

				captured.events!.next({ note_liked: { id: 'n2', title: 'Second', likes: 6 } })

				$mol_assert_equal(live.last_title(), 'Someone liked "Second" (n2), now 6 likes')
				$mol_assert_equal(live.status_title(), 'Live (SSE): connected / events: 2')

			})
		},

		'a stream failure surfaces in the status line'($) {
			const { captured, connect } = connect_probe()
			with_connect(connect, () => {

				const host = new $demo_graphql_subscription_host()
				const live = $demo_note_live.make({ $, subscription: () => host })

				$mol_assert_equal(live.status_title(), 'Live (SSE): connecting / events: 0')

				captured.events!.fail(new Error('boom'))

				$mol_assert_equal(live.status_title(), 'Live (SSE): boom')

			})
		},

	})

}
