import type { FeedState, FeedStore } from './store'
import type { GraphEvent, Snapshot } from './types'

/** 'demo' replays public/demo/feed.json; 'api' reads the backend (VITE_GRAPH_SOURCE=api in .env.local). */
export const SOURCE: 'demo' | 'api' = import.meta.env.VITE_GRAPH_SOURCE === 'demo' ? 'demo' : 'api'
const API_URL: string = import.meta.env.VITE_API_URL ?? '/api'
const EVENT_NAMES = ['session_opened', 'date_opened', 'answer_recorded', 'date_closed', 'session_closed', 'checkin_recorded'] as const
export const SESSIONS = 15
/** In auto-run, how long the simulated answers stay on screen before the date closes */
const AUTO_PAUSE_MS = 2500

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return response.json() as Promise<T>
}

/**
 * Live mode: load GET /graph/snapshot, then apply GET /events as they arrive. EventSource reconnects
 * on its own; after a drop the snapshot is reloaded so nothing missed in between is lost.
 */
export function connectApi(store: FeedStore, onStatus: (status: string) => void) {
  let events: EventSource | null = null
  let closed = false
  let dropped = false

  const loadSnapshot = () =>
    fetchJson<Snapshot>(`${API_URL}/graph/snapshot`).then((snapshot) => {
      if (!closed) store.load(snapshot)
    })

  loadSnapshot()
    .then(() => {
      if (closed) return
      events = new EventSource(`${API_URL}/events`)
      events.onopen = () => {
        onStatus('live')
        if (dropped) loadSnapshot().catch((error: Error) => onStatus(`error: ${error.message}`))
        dropped = false
      }
      events.onerror = () => {
        dropped = true
        onStatus('reconnecting')
      }
      // The backend emits the same event payloads the demo feed records, so live events go
      // through the same store.apply path; the snapshot is only reloaded after a reconnect.
      for (const name of EVENT_NAMES) {
        events.addEventListener(name, (message) => {
          if (!closed) store.apply({ event: name, data: JSON.parse((message as MessageEvent).data) } as GraphEvent)
        })
      }
    })
    .catch((error: Error) => onStatus(`error: ${error.message}`))

  return () => {
    closed = true
    events?.close()
  }
}

/**
 * Live mode HQ: runs the show through the backend's session and date routes (design doc sections 5
 * and 6), one step at a time or on a loop. The page still learns what happened from the event stream.
 */
export class LiveControls {
  busy = false
  auto = false
  error = ''
  private looping = false
  private store: FeedStore
  private onChange: () => void

  constructor(store: FeedStore, onChange: () => void) {
    this.store = store
    this.onChange = onChange
  }

  private async post(path: string) {
    this.busy = true
    this.error = ''
    this.onChange()
    try {
      const response = await fetch(`${API_URL}${path}`, { method: 'POST' })
      if (!response.ok) throw new Error(`${path} returned ${response.status}`)
    } catch (error) {
      this.error = (error as Error).message
      this.auto = false
      throw error
    } finally {
      this.busy = false
      this.onChange()
    }
  }

  openNext() {
    return this.post(`/sessions/${this.store.state.sessionsClosed}/open`)
  }

  simulate() {
    const s = this.store.state.session
    return s?.date_no != null ? this.post(`/admin/simulate/sessions/${s.session}/dates/${s.date_no}`) : Promise.resolve()
  }

  close() {
    const s = this.store.state.session
    return s?.date_no != null ? this.post(`/sessions/${s.session}/dates/${s.date_no}/close`) : Promise.resolve()
  }

  /** Opens sessions, simulates and closes dates until the show is over or you stop it. */
  async toggleAuto() {
    this.auto = !this.auto
    this.onChange()
    if (!this.auto || this.looping) return
    this.looping = true
    while (this.auto) {
      const { session, sessionsClosed } = this.store.state
      try {
        if (!session) {
          if (sessionsClosed >= SESSIONS) break
          await this.openNext()
          await this.until((s) => s.session?.date_no === 0)
        } else if (session.date_no !== null) {
          const tick = 4 * session.session + session.date_no
          await this.simulate()
          await sleep(AUTO_PAUSE_MS)
          await this.close()
          await this.until((s) => s.tick >= tick && (s.session === null || s.session.date_no !== null))
        } else {
          await sleep(300)  // the next date hasn't opened yet
        }
      } catch {
        break
      }
    }
    this.looping = false
    this.auto = false
    this.onChange()
  }

  stop() {
    this.auto = false
  }

  /** Waits for the event stream to report a step's result, so a slow stream never gets a step twice. */
  private async until(done: (state: FeedState) => boolean, timeoutMs = 60000) {
    const start = performance.now()
    while (this.auto && !done(this.store.state) && performance.now() - start < timeoutMs) await sleep(200)
  }
}

interface Feed {
  date_seconds: number
  snapshot: Snapshot
  timeline: (GraphEvent & { t: number })[]
}

/** The recorded feed is stored gzipped; a server that already decoded it works too. */
async function fetchFeed(url: string): Promise<Feed> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const body = new Blob([bytes]).stream()
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b
  return new Response(gzipped ? body.pipeThrough(new DecompressionStream('gzip')) : body).json() as Promise<Feed>
}

/** Demo mode: replays a recorded feed on a clock you can pause, speed up and restart. */
export class DemoPlayer {
  speed = 1
  playing = true
  clock = 0
  private feed: Feed | null = null
  private cursor = 0
  private last = 0
  private frame = 0
  private closed = false
  private store: FeedStore

  constructor(store: FeedStore) {
    this.store = store
  }

  async start(url = '/demo/feed.json.gz') {
    this.feed = await fetchFeed(url)
    if (this.closed) return  // unmounted while the feed loaded
    this.restart()
    this.last = performance.now()
    this.frame = requestAnimationFrame(this.tick)
  }

  restart() {
    if (!this.feed) return
    this.store.load(this.feed.snapshot)
    this.cursor = 0
    this.clock = 0
    this.playing = true
  }

  toggle() {
    this.playing = !this.playing
  }

  setSpeed(speed: number) {
    this.speed = speed
  }

  get done() {
    return this.feed !== null && this.cursor >= this.feed.timeline.length
  }

  private tick = (now: number) => {
    const timeline = this.feed?.timeline ?? []
    if (this.playing && !this.done) this.clock += ((now - this.last) / 1000) * this.speed
    this.last = now
    while (this.cursor < timeline.length && timeline[this.cursor].t <= this.clock) {
      this.store.apply(timeline[this.cursor++])
    }
    this.frame = requestAnimationFrame(this.tick)
  }

  close() {
    this.closed = true
    cancelAnimationFrame(this.frame)
  }
}
