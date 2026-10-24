import type { GraphNode } from '@falkordb/canvas'
import { FOREGROUND, GLOW } from './colors'

const GLOW_MS = 1800
/** Opacity of faded nodes (the canvas's own dimming skips custom-drawn nodes) */
const DIM_OPACITY = 0.18

/**
 * Nodes as the design doc's graph view specifies them: the fill is the tribe, the radius the
 * expertise, and the ring's size and opacity the uncertainty, so rings tighten as evidence comes in.
 * A node glows while its person answers or gets a new vote. Labels appear once you zoom in, except
 * for the ones marked alwaysLabel. Nodes marked dim are faded.
 */
export function drawNode(node: GraphNode, ctx: CanvasRenderingContext2D) {
  ctx.save()
  if (node.data.dim) ctx.globalAlpha = DIM_OPACITY
  paint(node, ctx)
  ctx.restore()
}

function paint(node: GraphNode, ctx: CanvasRenderingContext2D) {
  const x = node.x ?? 0
  const y = node.y ?? 0
  const r = node.size
  const zoom = ctx.getTransform().a / window.devicePixelRatio
  const age = Date.now() - node.expand[1].getTime()
  if (age < GLOW_MS) {
    const fade = 1 - age / GLOW_MS
    ctx.beginPath()
    ctx.arc(x, y, r + 3 + 7 * (1 - fade), 0, 2 * Math.PI)
    ctx.fillStyle = `rgba(${GLOW}, ${0.55 * fade})`
    ctx.fill()
  }
  const uncertainty = node.data.unc as number | undefined
  if (uncertainty !== undefined) {
    ctx.beginPath()
    ctx.arc(x, y, r + 1.5 + 5 * uncertainty, 0, 2 * Math.PI)
    ctx.strokeStyle = `rgba(230, 232, 238, ${0.12 + 0.6 * uncertainty})`
    ctx.lineWidth = 1.2
    ctx.stroke()
  }
  ctx.beginPath()
  if (node.shape === 'square') ctx.rect(x - r, y - r, 2 * r, 2 * r)
  else ctx.arc(x, y, r, 0, 2 * Math.PI)
  ctx.fillStyle = node.color
  ctx.fill()
  if (node.data.speaker) {
    ctx.beginPath()
    ctx.arc(x, y, Math.max(1, r * 0.3), 0, 2 * Math.PI)
    ctx.fillStyle = FOREGROUND
    ctx.fill()
  }
  const always = node.data.alwaysLabel === true
  if (node.data.label && (always || zoom > 1.6)) {
    ctx.font = `${always ? 600 : 400} ${(always ? 12 : 10) / zoom}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = FOREGROUND
    ctx.fillText(String(node.data.label), x, y + r + 2 / zoom + 5 * (uncertainty ?? 0))
  }
}

export function paintNodeArea(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.arc(node.x ?? 0, node.y ?? 0, node.size + 3, 0, 2 * Math.PI)
  ctx.fillStyle = color
  ctx.fill()
}
