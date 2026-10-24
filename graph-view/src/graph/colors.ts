export const BACKGROUND = '#0e1015'
export const FOREGROUND = '#e6e8ee'
export const MUTED = '#8b93a7'

/** One color per tribe slot (store.ts keeps a group of people on the same slot from date to date). */
const TRIBES = ['#7c6cff', '#ff7a59', '#2ec4b6', '#f6c344', '#ef476f', '#4cc9f0', '#90be6d', '#c77dff', '#f9844a',
  '#43aa8b', '#e9c46a', '#5b8def']
/** People with no positive tie yet, or in a tribe too small to color */
export const NO_TRIBE = '#5d6577'
export const tribeColor = (slot: number | undefined) => (slot === undefined ? NO_TRIBE : TRIBES[slot % TRIBES.length])

export const TOPICS = ['#f4d35e', '#e4572e', '#d9a066', '#c0392b', '#76b041', '#7f8c8d', '#17bebb', '#4c6ef5', '#e056fd',
  '#00b4d8']
export const topicColor = (idx: number) => TOPICS[idx % TOPICS.length]

export const NEW_EDGE = '#ffb020'
export const OLD_EDGE = 'rgba(176, 186, 204, 0.32)'
export const MEETING = 'rgba(230, 232, 238, 0.75)'
export const TALK = '#6b7790'
export const VENDOR = '#f6c344'
export const GLOW = '255, 176, 32'

/** HQ lines: warm when both people would act on each other's advice, gray when not */
export const WARM = 'rgba(255, 176, 32, 0.7)'
export const WARM_EARLIER = 'rgba(255, 176, 32, 0.12)'
export const COLD = 'rgba(176, 186, 204, 0.2)'
export const CHECKIN = 'rgba(46, 196, 182, 0.35)'
