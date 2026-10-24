import { useEffect, useState, useSyncExternalStore } from 'react'
import { DemoPlayer, LiveControls, SOURCE, connectApi } from './sources'
import { FeedStore } from './store'

/**
 * The graph state plus whatever is feeding it: the demo player, or the backend's live events with
 * the HQ controls that drive it.
 */
export function useGraphFeed() {
  const [store] = useState(() => new FeedStore())
  const [status, setStatus] = useState(SOURCE === 'demo' ? 'loading demo' : 'connecting')
  const [player, setPlayer] = useState<DemoPlayer | null>(null)
  const [, bump] = useState(0)
  const [controls] = useState(() => (SOURCE === 'api' ? new LiveControls(store, () => bump((n) => n + 1)) : null))
  const state = useSyncExternalStore(store.subscribe, store.getState)

  useEffect(() => {
    if (SOURCE === 'api') {
      const close = connectApi(store, setStatus)
      return () => {
        close()
        controls?.stop()
      }
    }
    const demo = new DemoPlayer(store)
    let cancelled = false
    demo
      .start()
      .then(() => {
        if (cancelled) return
        setPlayer(demo)
        setStatus('demo feed')
      })
      .catch((error: Error) => setStatus(`error: ${error.message}`))
    return () => {
      cancelled = true
      demo.close()
    }
  }, [store, controls])

  return { store, state, status, player, controls }
}
