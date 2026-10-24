import type { FalkorDBCanvas, ForceGraphConfig, GraphLink } from '@falkordb/canvas'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Tabs, TabsList, TabsTrigger } from '@falkordb/ui'
import { useMemo, useState } from 'react'
import { FalkorCanvas } from '../graph/FalkorCanvas'
import { Activity, Convergence, LastQuestion, Selected } from '../graph/SidePanel'
import { BACKGROUND, CHECKIN, COLD, FOREGROUND, MEETING, NEW_EDGE, NO_TRIBE, OLD_EDGE, TALK, VENDOR, WARM, WARM_EARLIER, topicColor, tribeColor } from '../graph/colors'
import { drawNode, paintNodeArea } from '../graph/draw'
import { IdMap, arrangeOverview, arrangeRoom, hqData, overviewData, topicData } from '../graph/graphData'
import { SESSIONS, SOURCE, type LiveControls } from '../graph/sources'
import type { FeedState } from '../graph/store'
import { useGraphFeed } from '../graph/useGraphFeed'
import './GraphView.css'

type Tab = 'hq' | 'topic' | 'overview'
const SPEEDS = ['1', '2', '4', '8', '16']

/** Meeting lines show who is talking right now; they shouldn't drag people across the graph. */
function holdMeetingsStill(canvas: FalkorDBCanvas) {
  const links = canvas.getGraph()?.d3Force('link') as unknown as { strength(fn: (link: GraphLink) => number): unknown } | undefined
  links?.strength((link) => (link.data.kind === 'MEETING' ? 0 : 0.3))
}

function phase(state: FeedState) {
  const s = state.session
  if (s) return s.date === null ? `Session ${s.session + 1}, between dates` : `Session ${s.session + 1}, date ${s.date + 1} of 4`
  if (state.sessionsClosed >= SESSIONS) return 'Show over'
  return state.sessionsClosed ? `${state.sessionsClosed} of ${SESSIONS} sessions run` : 'Before session 1'
}

export default function GraphView() {
  const { store, state, status, player, controls } = useGraphFeed()
  const [tab, setTab] = useState<Tab>('hq')
  const [topic, setTopic] = useState(0)
  const [everyone, setEveryone] = useState(false)
  const [dimension, setDimension] = useState<'2d' | '3d'>('2d')
  const [selected, setSelected] = useState<string | null>(null)
  const [, redraw] = useState(0)
  const [ids] = useState(() => ({
    hqNodes: new IdMap(), hqLinks: new IdMap(), topicNodes: new IdMap(), topicLinks: new IdMap(), overviewNodes: new IdMap(), overviewLinks: new IdMap(),
  }))

  const config = useMemo<Partial<ForceGraphConfig>>(() => ({
    backgroundColor: BACKGROUND,
    foregroundColor: FOREGROUND,
    captionsKeys: ['name'],
    node: { nodeCanvasObject: drawNode, nodePointerAreaPaint: paintNodeArea },
    linkLineDash: (link) => (link.data.kind === 'MEETING' ? [3, 3] : link.data.kind === 'CHECKIN' ? [1, 2] : []),
    nodeStyle: { glowDuration: 1800 },
    // Most attendees have no votes on a topic yet; a softer push keeps them in a readable cluster.
    // Fewer warm-up ticks: the canvas reruns them whenever people join a layout.
    simulation: { chargeStrength: -70, warmupTicks: 60 },
    layoutOptions: { force: { linkDistance: 28, collisionPadding: 5 } },
    eventHandlers: {
      onNodeClick: (node) => setSelected((node.data.key as string | undefined) ?? null),
      onBackgroundClick: () => setSelected(null),
    },
  }), [])

  // Only the visible tab rebuilds; `state` is a new object whenever the feed applies events
  const hqGraph = useMemo(() => (tab === 'hq' ? hqData(state, ids.hqNodes, ids.hqLinks) : null), [tab, state, ids])
  // The topic view only changes when a date opens or closes; rebuilding it on every answer kept its layout churning
  const { structure } = state
  const topicGraph = useMemo(
    () => (tab === 'topic' && structure ? topicData(store.getState(), topic, everyone, ids.topicNodes, ids.topicLinks) : null),
    [tab, structure, store, topic, everyone, ids])
  const overviewGraph = useMemo(() => (tab === 'overview' ? overviewData(state, ids.overviewNodes, ids.overviewLinks) : null), [tab, state, ids])

  const control = (change: () => void) => () => {
    change()
    redraw((n) => n + 1)
  }
  const loaded = state.attendees.size > 0
  const statusVariant = status.startsWith('error') ? 'destructive' : status === 'live' || status === 'demo feed' ? 'success' : 'warning'

  return (
    <div className="gv">
      <header className="gv-header">
        <div className="gv-brand">
          <h1>Conference Knowledge Graph</h1>
          <span className="gv-sub">Pizza Expo 2027 · drawn with FalkorDB Canvas</span>
        </div>
        <div className="gv-status">
          <Badge variant={statusVariant}>{status}</Badge>
          <Badge variant="outline">{phase(state)}</Badge>
        </div>
        {SOURCE === 'demo' && player && (
          <div className="gv-controls">
            <Button variant="secondary" onClick={control(() => player.toggle())}>
              {player.playing && !player.done ? 'Pause' : 'Play'}
            </Button>
            <Select value={String(player.speed)} onValueChange={(v) => control(() => player.setSpeed(Number(v)))()}>
              <SelectTrigger className="gv-speed"><SelectValue /></SelectTrigger>
              <SelectContent>{SPEEDS.map((s) => <SelectItem key={s} value={s}>{s}x speed</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="secondary" onClick={control(() => { player.restart(); setSelected(null) })}>
              {player.done ? 'Replay' : 'Restart'}
            </Button>
          </div>
        )}
        {controls && <LiveButtons state={state} controls={controls} />}
      </header>

      <div className="gv-toolbar">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="hq">Event HQ</TabsTrigger>
            <TabsTrigger value="topic">Topic view</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === 'topic' && (
          <>
            <Select value={String(topic)} onValueChange={(v) => setTopic(Number(v))}>
              <SelectTrigger className="gv-topic"><SelectValue /></SelectTrigger>
              <SelectContent>
                {state.topics.map((t) => <SelectItem key={t.idx} value={String(t.idx)}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="gv-switch">
              <Switch checked={everyone} onCheckedChange={setEveryone} /> Everyone
            </label>
          </>
        )}
        {tab !== 'hq' && (
          <label className="gv-switch gv-push">
            <Switch checked={dimension === '3d'} onCheckedChange={(on) => setDimension(on ? '3d' : '2d')} /> 3D
          </label>
        )}
      </div>

      <main className="gv-main">
        <div className="gv-center">
          {tab === 'hq' && <HqStats state={state} />}
          <section className="gv-stage">
            {loaded && (
              <>
                <div className={tab === 'hq' ? 'gv-layer' : 'gv-layer gv-hidden'}>
                  <FalkorCanvas data={hqGraph} config={config} dimension="2d" onData={arrangeRoom} />
                </div>
                <div className={tab === 'topic' ? 'gv-layer' : 'gv-layer gv-hidden'}>
                  <FalkorCanvas data={topicGraph} config={config} dimension={dimension} onData={holdMeetingsStill} />
                </div>
                <div className={tab === 'overview' ? 'gv-layer' : 'gv-layer gv-hidden'}>
                  <FalkorCanvas data={overviewGraph} config={config} dimension={dimension} onData={arrangeOverview} />
                </div>
              </>
            )}
            <GraphLegend tab={tab} />
          </section>
        </div>
        <aside className="gv-side">
          <Selected state={state} selected={selected} topic={tab === 'topic' ? topic : null} />
          <Convergence state={state} />
          <LastQuestion state={state} />
          <Activity state={state} />
        </aside>
      </main>
    </div>
  )
}

/** Live mode: run the show from here instead of curl. */
function LiveButtons({ state, controls }: { state: FeedState; controls: LiveControls }) {
  const s = state.session
  const dateOpen = s?.date != null
  const over = !s && state.sessionsClosed >= SESSIONS
  const idle = controls.busy || controls.auto
  const run = (step: () => Promise<void>) => () => void step().catch(() => undefined)
  return (
    <div className="gv-controls">
      <Button variant="secondary" disabled={idle || !!s || over} onClick={run(() => controls.openNext())}>
        Open session {Math.min(state.sessionsClosed + 1, SESSIONS)}
      </Button>
      <Button variant="secondary" disabled={idle || !dateOpen} onClick={run(() => controls.simulate())}>Simulate date</Button>
      <Button variant="secondary" disabled={idle || !dateOpen} onClick={run(() => controls.close())}>Close date</Button>
      <Button variant={controls.auto ? 'destructive' : 'default'} disabled={over && !controls.auto} onClick={run(() => controls.toggleAuto())}>
        {controls.auto ? 'Stop' : 'Auto-run'}
      </Button>
      {controls.error && <Badge variant="destructive">{controls.error}</Badge>}
    </div>
  )
}

function HqStats({ state }: { state: FeedState }) {
  const s = state.session
  let talking = 0
  let dates = 0
  for (const m of state.meetings.values()) {
    if (m.talking) talking += 1
    if (m.kind === 'date') dates += 1
  }
  const planned = s?.date != null ? s.dates[s.date]?.length ?? 0 : 0
  const last = state.metrics.at(-1)
  const pct = (value: number) => `${Math.round(value * 100)}%`
  const stats = [
    { label: 'Session', value: s ? `${s.session + 1} of ${SESSIONS}` : `${state.sessionsClosed} of ${SESSIONS}`,
      sub: s ? (s.date === null ? 'Between dates' : `Date ${s.date + 1} of 4`) : state.sessionsClosed >= SESSIONS ? 'Show over' : 'Sessions run' },
    { label: 'Talking now', value: talking.toLocaleString(), sub: planned ? `of ${planned} dates` : 'No date running' },
    { label: 'Speed dates', value: dates.toLocaleString(), sub: 'Pairs met so far' },
    { label: 'Check-ins', value: state.checkins.toLocaleString(), sub: 'QR scans on the floor' },
    { label: 'Answers', value: state.answers.toLocaleString(), sub: 'From both sides' },
    { label: 'New votes', value: state.newVotes.toLocaleString(), sub: 'Learned-from, last close' },
    { label: 'Meet again', value: last ? pct(last.meet_again_rate) : 'Not yet', sub: last ? `Would act ${pct(last.act_rate)}` : 'After the first date' },
  ]
  return (
    <div className="gv-stats">
      {stats.map((stat) => (
        <div key={stat.label} className="gv-stat">
          <span className="gv-stat-label">{stat.label}</span>
          <span className="gv-stat-value">{stat.value}</span>
          <span className="gv-stat-sub">{stat.sub}</span>
        </div>
      ))}
    </div>
  )
}

function GraphLegend({ tab }: { tab: Tab }) {
  const dot = (color: string, size = 10) => <span className="gv-dot" style={{ background: color, width: size, height: size }} />
  const line = (color: string, style: 'solid' | 'dashed' | 'dotted' = 'solid') => <span className="gv-swatch-line" style={{ borderTopColor: color, borderTopStyle: style }} />
  const rows = {
    hq: [
      { swatch: <>{dot(topicColor(0))}{dot(topicColor(2))}{dot(topicColor(7))}</>, text: 'Color: the topic they came for' },
      { swatch: dot(FOREGROUND, 12), text: 'Size: meetings so far' },
      { swatch: line(MEETING, 'dashed'), text: 'Date answering now' },
      { swatch: line(WARM), text: "Both would act on the other's advice" },
      { swatch: line(COLD), text: 'Met, not both would act' },
      { swatch: line(CHECKIN, 'dotted'), text: 'Check-in' },
      { swatch: line(WARM_EARLIER), text: 'Earlier sessions: warm lines only' },
      { swatch: dot('rgba(93, 101, 119, 0.35)'), text: 'Faded: not in the session running now' },
    ],
    topic: [
      { swatch: <>{dot(tribeColor(0))}{dot(tribeColor(1))}{dot(NO_TRIBE)}</>, text: 'Color: tribe' },
      { swatch: dot(FOREGROUND, 14), text: 'Size: competence on this topic' },
      { swatch: <span className="gv-ring" />, text: 'Ring: uncertainty, tightens with evidence' },
      { swatch: line(NEW_EDGE), text: 'Learned from, latest date' },
      { swatch: line(OLD_EDGE), text: 'Learned from, earlier dates' },
      { swatch: line(MEETING, 'dashed'), text: 'Date under way' },
    ],
    overview: [
      { swatch: dot(topicColor(0), 14), text: 'Topic' },
      { swatch: <span className="gv-square" style={{ background: TALK }} />, text: 'Talk' },
      { swatch: <span className="gv-square" style={{ background: VENDOR }} />, text: 'Vendor' },
      { swatch: dot(tribeColor(0)), text: 'Top 5 people per topic, by competence' },
      { swatch: line('rgba(255, 176, 32, 0.6)'), text: 'Among the top 5 on that topic' },
      { swatch: line('rgba(246, 195, 68, 0.5)'), text: 'Vendor targets the topic' },
    ],
  }[tab]
  return (
    <div className="gv-legend">
      {rows.map(({ swatch, text }) => (
        <div key={text} className="gv-legend-row"><span className="gv-swatches">{swatch}</span>{text}</div>
      ))}
    </div>
  )
}
