// What the graph page reads from the backend. CONTRACT.md describes each shape.

export interface Topic {
  idx: number
  /** String id used in payloads, e.g. 'dough-flour' */
  id: string
  name: string
}

export interface Attendee {
  id: string
  name: string
  is_speaker: boolean
  company?: string
  title?: string
  /** Community on POS_TIE; -1 until the person has a positive tie */
  tribe: number
  /** One value per topic, indexed by topic idx */
  comp: number[]
  comp_unc: number[]
  interest: number[]
  /** Distinct partners compared with on each topic */
  m?: number[]
  like?: number
  /** Speed-dating sessions they attend */
  sessions?: number[]
}

/** One LEARNED_FROM_T{k} edge: source learned from target. */
export interface LearnedEdge {
  topic_id: string
  source: string
  target: string
  tick: number
}

export interface Talk {
  id: string
  title: string
  type?: string
  topics: { idx: number; w: number }[]
}

export interface Vendor {
  id: string
  name: string
  profile: number[]
}

/** Metrics after one date close; tick = 4 · session + date_no */
export interface Metrics {
  tick: number
  [name: string]: number
}

export interface Pair {
  a: string
  b: string
  value?: number
}

/** A meeting so far, with each side's answer to "would you act on their recommendation?" if known */
export interface PastMeeting {
  kind: 'date' | 'checkin'
  tick: number
  a: string
  b: string
  act_a?: string | null
  act_b?: string | null
}

/** The open session: who is in it and its 4-date plan */
export interface OpenSession {
  session: number
  /** The date running now (0-3), or null between dates */
  date_no: number | null
  attendees: string[]
  dates: Pair[][]
}

export interface Snapshot {
  topics: Topic[]
  attendees: Attendee[]
  edges: LearnedEdge[]
  talks: Talk[]
  vendors: Vendor[]
  metrics: Metrics[]
  /** Optional: lets the HQ view redraw earlier meetings after a reload */
  meetings?: PastMeeting[]
  session?: OpenSession | null
  /** Latest closed tick, -1 before the first date closes */
  tick?: number
}

export interface SessionOpened {
  session: number
  attendees: string[]
  /** All 4 dates, planned at open */
  dates: Pair[][]
}

export interface DateOpened {
  session: number
  date_no: number
  tick: number
}

export interface Answer {
  question_id: string
  kind: 'met' | 'claim' | 'act' | 'meet_again'
  topic_id?: string | null
  claim?: 'partner_taught' | 'self_taught' | null
  value: string
  text?: string
  why?: { score: number; ig: number; plausibility: number } | null
}

export interface AnswerRecorded {
  source: 'date' | 'checkin'
  session?: number
  date_no?: number
  tick: number
  rater_id: string
  partner_id: string
  /** The rater's survey is complete after this submission */
  complete?: boolean
  answers: Answer[]
}

export interface DateClosed {
  session: number
  date_no: number
  tick: number
  metrics: Metrics
  /** Attendees whose values changed; only the changed fields need to be present */
  nodes: (Partial<Attendee> & { id: string })[]
  /** LEARNED_FROM edges written at this close */
  edges: LearnedEdge[]
}

export interface SessionClosed {
  session: number
}

export interface CheckinRecorded {
  scanner_id: string
  scanned_id: string
  tick: number
  /** Times these two have checked in with each other */
  count?: number
}

export type GraphEvent =
  | { event: 'session_opened'; data: SessionOpened }
  | { event: 'date_opened'; data: DateOpened }
  | { event: 'answer_recorded'; data: AnswerRecorded }
  | { event: 'date_closed'; data: DateClosed }
  | { event: 'session_closed'; data: SessionClosed }
  | { event: 'checkin_recorded'; data: CheckinRecorded }
