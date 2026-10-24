// @falkordb/canvas declares <falkordb-canvas> on the global JSX namespace; React 19 reads React.JSX.
import type { CanvasRenderMode, FalkorDBCanvas } from '@falkordb/canvas'
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'falkordb-canvas': DetailedHTMLProps<HTMLAttributes<FalkorDBCanvas>, FalkorDBCanvas> & {
        'node-mode'?: CanvasRenderMode
        'link-mode'?: CanvasRenderMode
      }
    }
  }
}
