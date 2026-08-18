/// <reference types="vite/client" />

import type { KentuckyAPI } from '../../preload/index'

declare module '@brand/icon.svg?url' {
  const src: string
  export default src
}

declare global {
  interface Window {
    kentucky?: KentuckyAPI
  }
}

export {}
