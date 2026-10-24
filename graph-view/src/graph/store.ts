import type { Answer, Attendee, GraphEvent, LearnedEdge, Metrics, OpenSession, Snapshot, Talk, Topic, Vendor } from './types'

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
/** How many tribes get their own color; smaller ones stay gray */
export const TRIBE_COLORS = 12

export interface Meeting {
  kind: 'date' | 'checkin'
  a: string
  b: string
  tick: number
  /** Each side's answer to "would you act on their recommendation?": yes, maybe or no */
  act: Record<string, string>
  /** Answers are still arriving for this date */
  talking: boolean
}

export interface FeedState {
  topics: Topic[]
  topicIdx: Map<string, number>
  talks: Talk[]
  vendors: Vendor[]
  attendees: Map<string, Attendee>
  /** Each person's top interest when the show started: their seat and color in the HQ room */
  homeTopic: Map<string, number>
  edges: LearnedEdge[]
  metrics: Metrics[]
  /** The open session, or null between sessions */
  session: OpenSession | null
  inSession: Set<string>
  /** Latest closed tick, -1 before the first date closes */
  tick: number
  /** Sessions closed so far */
  sessionsClosed: number
  /** Every speed date and check-in so far, keyed by kind and pair */
  meetings: Map<string, Meeting>
  checkins: number
  answers: number
  /** LEARNED_FROM edges written at the latest close */
  newVotes: number
  /** Color slot per attendee, kept on the same group of people from one close to the next */
  tribeSlot: Map<string, number>
  /** Flipped on every answer, check-in and new vote; the canvas glows a node each time its flag flips */
  glow: Map<string, boolean>
  lastQuestion: { rater: string; partner: string; tick: number; answer: Answer } | null
  activity: { id: number; text: string }[]
  /** Bumped when a session or date opens or closes, not on answers and check-ins */
  structure: number
}

function emptyState(): FeedState {
  return {
    topics: [], topicIdx: new Map(), talks: [], vendors: [], attendees: new Map(), homeTopic: new Map(), edges: [], metrics: [], session: null,
    inSession: new Set(), tick: -1, sessionsClosed: 0, meetings: new Map(), checkins: 0, answers: 0, newVotes: 0,
    tribeSlot: new Map(), glow: new Map(), lastQuestion: null, activity: [], structure: 0,
  }
}

/**
 * Gives the biggest tribes a color slot each. Backends renumber communities on every run, so a
 * tribe takes the free slot whose previous members it overlaps most, and colors stay put.
 */
function assignTribeSlots(attendees: Map<string, Attendee>, previous: Map<string, number>) {
  const members = new Map<number, string[]>()
  for (const a of attendees.values()) {
    if (a.tribe >= 0) members.set(a.tribe, [...(members.get(a.tribe) ?? []), a.id])
  }
  const tribes = [...members.values()].filter((m) => m.length >= 3).sort((x, y) => y.length - x.length).slice(0, TRIBE_COLORS)
  const free = new Set(Array.from({ length: TRIBE_COLORS }, (_, n) => n))
  const slots = new Map<string, number>()
  for (const people of tribes) {
    const overlap = new Map<number, number>()
    for (const id of people) {
      const slot = previous.get(id)
      if (slot !== undefined && free.has(slot)) overlap.set(slot, (overlap.get(slot) ?? 0) + 1)
    }
    const slot = [...overlap].sort((x, y) => y[1] - x[1])[0]?.[0] ?? Math.min(...free)
    free.delete(slot)
    for (const id of people) slots.set(id, slot)
  }
  return slots
}

/**
 * Holds the graph as the backend describes it, applies live events, and tells React when to
 * repaint. Each repaint gets a fresh top-level state object, so React can compare by identity.
 */
export class FeedStore {
  state = emptyState()
  private listeners = new Set<() => void>()
  private timer = 0
  private activityId = 0

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = () => this.state

  load(snapshot: Snapshot) {
    const state = emptyState()
    state.topics = snapshot.topics
    state.topicIdx = new Map(snapshot.topics.map((t) => [t.id, t.idx]))
    state.talks = snapshot.talks
    state.vendors = snapshot.vendors
    state.attendees = new Map(snapshot.attendees.map((a) => [a.id, { ...a }]))
    state.homeTopic = new Map(snapshot.attendees.map((a) => [a.id, a.interest.indexOf(Math.max(...a.interest))]))
    state.edges = [...snapshot.edges]
    state.metrics = [...snapshot.metrics]
    state.tick = snapshot.tick ?? Math.max(-1, ...snapshot.metrics.map((m) => m.tick))
    state.sessionsClosed = Math.floor((state.tick + 1) / 4)
    if (snapshot.session) {
      state.session = { ...snapshot.session }
      state.inSession = new Set(snapshot.session.attendees)
      state.sessionsClosed = snapshot.session.session
    }
    for (const m of snapshot.meetings ?? []) {
      const act: Record<string, string> = {}
      if (m.act_a) act[m.a] = m.act_a
      if (m.act_b) act[m.b] = m.act_b
      if (m.kind === 'checkin') state.checkins += 1
      state.meetings.set(`${m.kind}|${pairKey(m.a, m.b)}`, { kind: m.kind, a: m.a, b: m.b, tick: m.tick, act, talking: false })
    }
    state.tribeSlot = assignTribeSlots(state.attendees, new Map())
    state.structure = this.state.structure + 1
    this.state = state
    this.notify(true)
  }

  apply({ event, data }: GraphEvent) {
    const s = this.state
    if (event === 'session_opened') {
      s.session = { session: data.session, date: null, attendees: data.attendees, dates: data.dates }
      s.inSession = new Set(data.attendees)
      this.log(`Session ${data.session + 1} opened: ${data.attendees.length} people, 4 dates planned`)
    } else if (event === 'date_opened') {
      if (s.session) s.session = { ...s.session, date: data.date }
      this.log(`Session ${data.session + 1}, date ${data.date + 1} started`)
    } else if (event === 'answer_recorded') {
      const kind = data.source === 'checkin' ? 'checkin' : 'date'
      const key = `${kind}|${pairKey(data.rater_id, data.partner_id)}`
      const meeting = s.meetings.get(key) ?? { kind, a: data.rater_id, b: data.partner_id, tick: data.tick, act: {}, talking: false }
      meeting.talking = kind === 'date' && s.session?.date === data.date
      for (const answer of data.answers) {
        if (answer.kind === 'act') meeting.act[data.rater_id] = answer.value
        if (answer.text) s.lastQuestion = { rater: data.rater_id, partner: data.partner_id, tick: data.tick, answer }
      }
      s.meetings.set(key, meeting)
      s.answers += data.answers.length
      for (const id of [data.rater_id, data.partner_id]) s.glow.set(id, !s.glow.get(id))
    } else if (event === 'checkin_recorded') {
      const key = `checkin|${pairKey(data.scanner_id, data.scanned_id)}`
      const meeting = s.meetings.get(key)
      if (meeting) meeting.tick = data.tick
      else s.meetings.set(key, { kind: 'checkin', a: data.scanner_id, b: data.scanned_id, tick: data.tick, act: {}, talking: false })
      s.checkins += 1
      for (const id of [data.scanner_id, data.scanned_id]) s.glow.set(id, !s.glow.get(id))
    } else if (event === 'date_closed') {
      s.tick = data.tick
      if (s.session) s.session = { ...s.session, date: null }
      for (const meeting of s.meetings.values()) meeting.talking = false
      for (const patch of data.nodes) {
        const attendee = s.attendees.get(patch.id)
        if (attendee) Object.assign(attendee, patch)
      }
      s.edges.push(...data.edges)
      s.newVotes = data.edges.length
      for (const edge of data.edges) s.glow.set(edge.target, !s.glow.get(edge.target))
      s.metrics = [...s.metrics.filter((m) => m.tick !== data.tick), data.metrics]
      s.tribeSlot = assignTribeSlots(s.attendees, s.tribeSlot)
      this.log(`Date ${data.date + 1} closed: ${data.edges.length} new learned-from votes`)
    } else {
      s.session = null
      s.inSession = new Set()
      s.sessionsClosed = data.session + 1
      this.log(`Session ${data.session + 1} closed`)
    }
    const structural = event !== 'answer_recorded' && event !== 'checkin_recorded'
    if (structural) s.structure += 1
    this.notify(structural)
  }

  private log(text: string) {
    this.state.activity = [{ id: this.activityId++, text }, ...this.state.activity].slice(0, 6)
  }

  /** Answers can arrive dozens a second, so they repaint at most five times a second. */
  private notify(now: boolean) {
    if (now) {
      window.clearTimeout(this.timer)
      this.timer = 0
      this.flush()
    } else if (!this.timer) {
      this.timer = window.setTimeout(() => {
        this.timer = 0
        this.flush()
      }, 200)
    }
  }

  private flush() {
    this.state = { ...this.state }
    for (const listener of this.listeners) listener()
  }
}
