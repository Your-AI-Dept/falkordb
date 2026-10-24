import '@falkordb/canvas'
import type { CanvasDimension, Data, FalkorDBCanvas, ForceGraphConfig } from '@falkordb/canvas'
import { useEffect, useRef } from 'react'

interface Props {
  /** null leaves the canvas as it is (a hidden tab skips the work) */
  data: Data | null
  config: Partial<ForceGraphConfig>
  dimension: CanvasDimension
  /** Called after every data update; `first` is true for the initial layout */
  onData?: (canvas: FalkorDBCanvas, first: boolean) => void
}

/**
 * FalkorDB's <falkordb-canvas> driven by React: the first data lays the graph out, and every later
 * update goes through setGraphData, which keeps node positions and adds or drops only what changed.
 */
export function FalkorCanvas({ data, config, dimension, onData }: Props) {
  const ref = useRef<FalkorDBCanvas>(null)
  const laidOut = useRef(false)

  useEffect(() => {
    ref.current?.setConfig(config)
  }, [config])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !data) return
    const first = !laidOut.current
    if (first) {
      canvas.setData(data)
    } else {
      // force-graph reruns its warm-up ticks on every data change, which blocks for about a second
      // with 1,000 people; after the first layout, updates animate (or stay pinned) instead
      canvas.getGraph()?.warmupTicks(0)
      canvas.setGraphData(data)
    }
    laidOut.current = true
    onData?.(canvas, first)
  }, [data, onData])

  useEffect(() => {
    ref.current?.setDimension(dimension).catch(() => undefined)
  }, [dimension])

  return <falkordb-canvas ref={ref} style={{ display: 'block', width: '100%', height: '100%' }} />
}
