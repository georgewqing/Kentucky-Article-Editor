/**
 * Canonical store lives at src/renderer/src/state/appStore.ts.
 * This path matches the project plan / IDE expectations and re-exports it.
 */
export {
  useAppStore,
  type EditorKind,
  type OpenTab,
  type Toast,
  type RecentWorkspace,
  type ActiveView
} from '../renderer/src/state/appStore'
