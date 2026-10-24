import type { Data, FalkorDBCanvas, GraphNode, Link, Node } from '@falkordb/canvas'
import { CHECKIN, COLD, MEETING, NEW_EDGE, OLD_EDGE, TALK, VENDOR, WARM, WARM_EARLIER, topicColor, tribeColor } from './colors'
import { pairKey, type FeedState } from './store'

/** The overview lists this many people per topic, highest competence first. */
export const TOP_PER_TOPIC = 5

/** Canvas wants numeric ids; this hands out a stable one per string key. */
export class IdMap {
  private ids = new Map<string, number>()

  get(key: string) {
    let id = this.ids.get(key)
    if (id === undefined) {
      id = this.ids.size + 1
      this.ids.set(key, id)
    }
    return id
  }
}

function link(id: number, source: number, target: number, color: string, style: Partial<Link>, data: Link['data']): Link {
  return { id, relationship: '', source, target, color, visible: true, ...style, data }
}

const favorite = (values: number[]) => values.indexOf(Math.max(...values))

/**
 * One topic's LEARNED_FROM layer: an arrow from learner to expert, and dashes for the date under
 * way. Only people with evidence on the topic are shown, unless `everyone` is on or nobody has any yet.
 */
export function topicData(state: FeedState, k: number, everyone: boolean, ids: IdMap, links: IdMap): Data {
  const learned = new Map<string, { source: string; target: string; tick: number }>()
  for (const e of state.edges) {
    const key = `${e.source}|${e.target}`
    if (state.topicIdx.get(e.topic_id) === k && e.tick >= (learned.get(key)?.tick ?? -1)) learned.set(key, e)
  }
  const involved = new Set<string>()
  for (const e of learned.values()) involved.add(e.source).add(e.target)
  const people = [...state.attendees.values()].filter((a) => everyone || involved.size === 0 || involved.has(a.id))
  const shown = new Set(people.map((a) => a.id))
  const nodes: Node[] = people.map((a) => ({
    id: ids.get(a.id),
    labels: ['Attendee'],
    color: tribeColor(state.tribeSlot.get(a.id)),
    visible: true,
    size: 3 + 12 * (a.comp[k] ?? 0.5),
    expand: state.glow.get(a.id) ?? false,
    data: { key: a.id, kind: 'attendee', label: a.name, name: a.name, unc: a.comp_unc[k], speaker: a.is_speaker },
  }))
  const arrows = [...learned.values()].map((e) => {
    const fresh = e.tick === state.tick
    return link(links.get(`learned|${k}|${e.source}|${e.target}`), ids.get(e.source), ids.get(e.target), fresh ? NEW_EDGE : OLD_EDGE,
      { width: fresh ? 2 : 1, arrowSize: fresh ? 5 : 3.5 }, { kind: 'LEARNED_FROM', tick: e.tick })
  })
  const open = state.session?.date != null ? state.session.dates[state.session.date] ?? [] : []
  const meetings = open.filter((p) => shown.has(p.a) && shown.has(p.b)).map((p) =>
    link(links.get(`meeting|${pairKey(p.a, p.b)}`), ids.get(p.a), ids.get(p.b), MEETING, { arrowSize: 0 }, { kind: 'MEETING' }))
  return { nodes, links: [...arrows, ...meetings] }
}

/**
 * The HQ room: every attendee, seated and colored by the topic they came for. A date shows as a
 * dashed line while its answers arrive, then stays: warm if both would act on each other's advice,
 * gray if not. Check-ins are teal dots. Earlier sessions keep only their warm lines, faint, so the
 * room stays readable (and fast) as thousands of meetings pile up. People outside the running
 * session fade back.
 */
export function hqData(state: FeedState, ids: IdMap, links: IdMap): Data {
  const meetings = [...state.meetings.values()]
  const count = new Map<string, number>()
  for (const m of meetings) for (const id of [m.a, m.b]) count.set(id, (count.get(id) ?? 0) + 1)
  const open = state.session
  const nodes: Node[] = [...state.attendees.values()].map((a) => ({
    id: ids.get(a.id),
    labels: ['Attendee'],
    color: topicColor(state.homeTopic.get(a.id) ?? 0),
    visible: true,
    size: 2.5 + 0.9 * Math.sqrt(count.get(a.id) ?? 0),
    expand: state.glow.get(a.id) ?? false,
    data: { key: a.id, kind: 'attendee', label: a.name, name: a.name, speaker: a.is_speaker, topic: state.homeTopic.get(a.id) ?? 0,
      dim: open !== null && !state.inSession.has(a.id) },
  }))
  for (const t of state.topics) {
    nodes.push({ id: ids.get(`room|${t.idx}`), labels: ['Room'], color: 'transparent', visible: true, size: 0.5,
      data: { kind: 'room', topic: t.idx, label: t.name, alwaysLabel: true } })
  }
  // The session on screen: the running one, or the last one between sessions. A check-in made
  // after close t happens during date t + 1.
  const firstTick = 4 * (open?.session ?? Math.max(0, state.sessionsClosed - 1))
  const edges: Link[] = []
  for (const m of meetings) {
    const acts = Object.values(m.act)
    const warm = acts.length === 2 && acts.every((v) => v === 'yes')
    const current = m.tick + (m.kind === 'checkin' ? 1 : 0) >= firstTick
    if (!current && !warm) continue
    const color = m.talking ? MEETING : warm ? (current ? WARM : WARM_EARLIER) : m.kind === 'checkin' ? CHECKIN : COLD
    edges.push(link(links.get(`${m.kind}|${pairKey(m.a, m.b)}`), ids.get(m.a), ids.get(m.b), color,
      { arrowSize: 0, width: m.talking ? 1.3 : warm && current ? 1.4 : 0.8 },
      { kind: m.talking ? 'MEETING' : m.kind === 'checkin' ? 'CHECKIN' : 'MET' }))
  }
  return { nodes, links: edges }
}

/**
 * Both graphs on one canvas, joined through topics: talks and vendors on one side and, on the
 * other, the top people on each topic right now, so names move in and out as dates close.
 */
export function overviewData(state: FeedState, ids: IdMap, links: IdMap): Data {
  const nodes: Node[] = []
  const edges: Link[] = []
  const topicId = (idx: number) => ids.get(`topic|${idx}`)
  for (const t of state.topics) {
    nodes.push({ id: topicId(t.idx), labels: ['Topic'], color: topicColor(t.idx), visible: true, size: 12,
      data: { kind: 'topic', topic: t.idx, label: t.name, name: t.name, alwaysLabel: true } })
  }
  for (const talk of state.talks) {
    const id = ids.get(`talk|${talk.id}`)
    nodes.push({ id, labels: ['Talk'], color: TALK, visible: true, size: 3, shape: 'square',
      data: { kind: 'talk', label: talk.title, name: talk.title, topic: talk.topics[0]?.idx ?? 0 } })
    for (const { idx, w } of talk.topics) {
      if (w >= 0.25) edges.push(link(links.get(`about|${talk.id}|${idx}`), id, topicId(idx), 'rgba(107, 119, 144, 0.5)', { arrowSize: 0 }, { kind: 'ABOUT' }))
    }
  }
  for (const vendor of state.vendors) {
    const id = ids.get(`vendor|${vendor.id}`)
    nodes.push({ id, labels: ['Vendor'], color: VENDOR, visible: true, size: 4, shape: 'square',
      data: { kind: 'vendor', label: vendor.name, name: vendor.name, topic: favorite(vendor.profile) } })
    vendor.profile.forEach((w, idx) => {
      if (w >= 0.15) edges.push(link(links.get(`targets|${vendor.id}|${idx}`), id, topicId(idx), 'rgba(246, 195, 68, 0.35)', { arrowSize: 0 }, { kind: 'TARGETS' }))
    })
  }
  const people = [...state.attendees.values()]
  const top = new Map<string, number[]>()
  for (const t of state.topics) {
    const ranked = [...people].sort((x, y) => y.comp[t.idx] - x.comp[t.idx] || x.comp_unc[t.idx] - y.comp_unc[t.idx])
    for (const a of ranked.slice(0, TOP_PER_TOPIC)) top.set(a.id, [...(top.get(a.id) ?? []), t.idx])
  }
  for (const a of people) {
    const topics = top.get(a.id)
    if (!topics) continue
    const id = ids.get(`attendee|${a.id}`)
    nodes.push({ id, labels: ['Attendee'], color: tribeColor(state.tribeSlot.get(a.id)), visible: true,
      size: 3 + 5 * Math.max(...topics.map((k) => a.comp[k])), expand: state.glow.get(a.id) ?? false,
      data: { key: a.id, kind: 'attendee', label: a.name, name: a.name, speaker: a.is_speaker, topic: topics[0] } })
    for (const k of topics) edges.push(link(links.get(`top|${a.id}|${k}`), id, topicId(k), 'rgba(255, 176, 32, 0.6)', { arrowSize: 0 }, { kind: 'TOP_ON' }))
  }
  return { nodes, links: edges }
}

function pin(node: GraphNode, x: number, y: number) {
  node.x = node.fx = x
  node.y = node.fy = y
}

const SEAT = 7.5
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/**
 * Seats the HQ room once: one neighborhood per topic around a ring, everyone in the neighborhood of
 * the topic they were most interested in at the start. Nobody moves after this, so new lines are
 * easy to spot.
 */
export function arrangeRoom(canvas: FalkorDBCanvas, first: boolean) {
  if (!first) return
  const nodes = canvas.getGraphData().nodes
  const groups = new Map<number, GraphNode[]>()
  for (const node of nodes) {
    if (node.data.kind === 'attendee') groups.set(node.data.topic, [...(groups.get(node.data.topic) ?? []), node])
  }
  const rooms = nodes.filter((n) => n.data.kind === 'room')
  const radius = (k: number) => SEAT * Math.sqrt(groups.get(k)?.length ?? 0)
  const ring = (2 * Math.max(...[...groups.keys()].map(radius)) + 40) / (2 * Math.sin(Math.PI / rooms.length))
  const center = (k: number) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * k) / rooms.length
    return [ring * Math.cos(angle), ring * Math.sin(angle)]
  }
  for (const node of rooms) {
    const [x, y] = center(node.data.topic)
    pin(node, x, y - radius(node.data.topic) - 16)
  }
  for (const [k, group] of groups) {
    const [x, y] = center(k)
    group.sort((a, b) => String(a.data.key).localeCompare(String(b.data.key)))
    group.forEach((node, n) => {
      const r = SEAT * Math.sqrt(n + 0.5)
      pin(node, x + r * Math.cos(n * GOLDEN_ANGLE), y + r * Math.sin(n * GOLDEN_ANGLE))
    })
  }
  canvas.setAnimation(false)
  canvas.refresh()
  canvas.zoomToFit(0.95)
}

const TOPIC_GAP = 64

/**
 * Pins the overview into columns: talks far left, vendors next, topics down the middle and the top
 * people on the right, each sorted by topic so their lines stay short. It runs after every update,
 * since people move in and out of the top lists.
 */
export function arrangeOverview(canvas: FalkorDBCanvas, first: boolean) {
  const nodes = canvas.getGraphData().nodes
  const byTopic = (kind: string) => nodes.filter((n) => n.data.kind === kind)
    .sort((a, b) => (a.data.topic as number) - (b.data.topic as number) || String(a.data.label).localeCompare(String(b.data.label)))
  const half = 4.5 * TOPIC_GAP + 30
  const column = (kind: string, x: number, subColumns: number, gap: number) => {
    const sorted = byTopic(kind)
    sorted.forEach((node, n) => pin(node, x + (n % subColumns) * gap, -half + (2 * half * n) / Math.max(1, sorted.length - 1)))
  }
  for (const node of byTopic('topic')) pin(node, 0, ((node.data.topic as number) - 4.5) * TOPIC_GAP)
  column('talk', -560, 2, 34)
  column('vendor', -320, 3, 30)
  column('attendee', 300, 2, 40)
  if (first) canvas.setAnimation(false)
  canvas.refresh()
  if (first) canvas.zoomToFit(0.9)  // leave room for the legend
}
