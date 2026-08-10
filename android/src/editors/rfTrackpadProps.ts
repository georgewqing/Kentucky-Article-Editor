import { PanOnScrollMode } from '@xyflow/react'

/** Mac-like canvas: two-finger pan, pinch zoom, Ctrl/Meta+wheel zoom. */
export const RF_TRACKPAD_PROPS = {
  panOnScroll: true,
  panOnScrollMode: PanOnScrollMode.Free,
  zoomOnScroll: false,
  zoomOnPinch: true,
  zoomActivationKeyCode: ['Meta', 'Control'] as string[],
  panOnDrag: true,
  selectionOnDrag: false,
  multiSelectionKeyCode: ['Meta', 'Control'] as string[],
  minZoom: 0.1,
  maxZoom: 4
}
