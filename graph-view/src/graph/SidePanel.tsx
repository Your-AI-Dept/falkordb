import { Badge, Card, CardContent, CardHeader, CardTitle } from '@falkordb/ui'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHECKIN, FOREGROUND, MUTED, NEW_EDGE, tribeColor } from './colors'
import type { FeedState } from './store'

const METRIC_LABELS: Record<string, string> = {
  uncertainty: 'Uncertainty', coverage: 'Coverage', stability: 'Stability', meet_again_rate: 'Meet again', act_rate: 'Would act',
  act_yes_rate: 'Would act',
}
const METRIC_COLORS = ['#ef476f', '#2ec4b6', '#7c6cff', '#f6c344', '#4cc9f0', '#90be6d']
const NOT_METRICS = new Set(['tick', 'session', 'date', 'date_no'])
const ANSWERS: Record<string, string> = { true: 'True', false: 'False', skip: "Didn't come up" }
/** "Session 3, date 2" for a tick */
const tickLabel =(tick: number) => `Session ${Math.floor(tick / 4) + 1}, date ${(tick % 4) + 1}`

export function Convergence({ state }: { state: FeedState }) {
  const keys = [...new Set(state.metrics.flatMap((m) => Object.keys(m)))].filter((k) => !NOT_METRICS.has(k))
  return (
    <Card className="gv-card">
      <CardHeader><CardTitle>Convergence</CardTitle></CardHeader>
      <CardContent>
        {state.metrics.length === 0 ? (
          <p className="gv-muted">Fills in as dates close.</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={state.metrics} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid stroke="rgba(139, 147, 167, 0.15)" />
              <XAxis dataKey="tick" stroke={MUTED} fontSize={11} tickLine={false} tickFormatter={(t: number) => `S${Math.floor(t / 4) + 1}`} />
              <YAxis domain={[0, 1]} stroke={MUTED} fontSize={11} tickLine={false} />
              <Tooltip contentStyle={{ background: '#161922', border: '1px solid #2a2f3d', fontSize: 12 }} labelFormatter={(t) => tickLabel(Number(t))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {keys.map((key, n) => (
                <Line key={key} dataKey={key} name={METRIC_LABELS[key] ?? key} stroke={METRIC_COLORS[n % METRIC_COLORS.length]}
                  strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function LastQuestion({ state }: { state: FeedState }) {
  const q = state.lastQuestion
  const name = (id: string) => state.attendees.get(id)?.name ?? id
  const why = q?.answer.why
  return (
    <Card className="gv-card">
      <CardHeader><CardTitle>Why this question</CardTitle></CardHeader>
      <CardContent>
        {!q ? (
          <p className="gv-muted">The latest generated question shows here as answers come in.</p>
        ) : (
          <div className="gv-question">
            <p className="gv-qtext">{q.answer.text}</p>
            <p className="gv-muted">{name(q.rater)} about {name(q.partner)}, {tickLabel(q.tick).toLowerCase()}</p>
            <Badge variant={q.answer.value === 'skip' ? 'secondary' : 'default'}>{ANSWERS[q.answer.value] ?? q.answer.value}</Badge>
            {why && (
              <div className="gv-why">
                {(['score', 'ig', 'plausibility'] as const).map((key) => (
                  <div key={key} className="gv-why-row">
                    <span>{key === 'ig' ? 'Information gain' : key[0].toUpperCase() + key.slice(1)}</span>
                    <div className="gv-bar"><div style={{ width: `${Math.min(100, why[key] * 100)}%` }} /></div>
                    <span className="gv-num">{why[key].toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function Selected({ state, selected, topic }: { state: FeedState; selected: string | null; topic: number | null }) {
  const a = selected ? state.attendees.get(selected) : undefined
  if (!a) return null
  const strongest = a.comp.map((c, idx) => ({ c, idx })).sort((x, y) => y.c - x.c).slice(0, 3)
  const slot = state.tribeSlot.get(a.id)
  return (
    <Card className="gv-card">
      <CardHeader><CardTitle>{a.name}</CardTitle></CardHeader>
      <CardContent>
        <p className="gv-muted">{[a.title, a.company].filter(Boolean).join(', ')}</p>
        <p className="gv-meta">
          <span className="gv-dot" style={{ background: tribeColor(slot) }} /> {a.tribe >= 0 ? `Tribe ${a.tribe}` : 'No tribe yet'}
          {a.is_speaker ? ' · Speaker' : ''}
          {a.like !== undefined ? ` · Likability ${a.like.toFixed(2)}` : ''}
          {a.sessions ? ` · Sessions ${a.sessions.map((s) => s + 1).join(', ')}` : ''}
        </p>
        {topic !== null && (
          <p className="gv-meta">
            {state.topics[topic]?.name}: competence {a.comp[topic].toFixed(2)}, uncertainty {a.comp_unc[topic].toFixed(2)}
          </p>
        )}
        <p className="gv-meta" style={{ color: FOREGROUND }}>
          Strongest: {strongest.map(({ c, idx }) => `${state.topics[idx]?.name} ${c.toFixed(2)}`).join(', ')}
        </p>
      </CardContent>
    </Card>
  )
}

export function Activity({ state }: { state: FeedState }) {
  return (
    <Card className="gv-card">
      <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
      <CardContent>
        <p className="gv-meta">
          <span className="gv-dot" style={{ background: NEW_EDGE }} /> {state.answers.toLocaleString()} answers
          <span className="gv-dot" style={{ background: CHECKIN }} /> {state.checkins.toLocaleString()} check-ins
        </p>
        <ul className="gv-activity">
          {state.activity.map((item) => <li key={item.id}>{item.text}</li>)}
        </ul>
      </CardContent>
    </Card>
  )
}
