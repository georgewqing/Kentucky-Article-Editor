/// <reference types="vite/client" />

import type { KentuckyAPI } from '../../preload/index'

declare global {
  interface Window {
    kentucky?: KentuckyAPI
  }
}

export {}
