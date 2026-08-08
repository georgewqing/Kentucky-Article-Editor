import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ccfox12.kentucky',
  appName: 'KENTUCKY',
  webDir: 'dist',
  android: {
    path: 'native'
  },
  server: {
    androidScheme: 'https'
  }
}

export default config
