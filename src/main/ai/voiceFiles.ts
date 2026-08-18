import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { asStringArray, dumpYamlDoc, parseYamlDoc } from './yamlUtil'

export const VOICE_ANCHOR_FILE = 'voice_anchor.yaml'
export const VOICE_BANK_FILE = 'voice_bank.yaml'

export type VoiceAnchorBlock = {
  person?: string
  tense?: string
  sentence?: string
  metaphorDensity?: string
  lexicon?: string
  notes?: string
}

export type VoiceAnchorDoc = {
  version: number
  default: VoiceAnchorBlock
  byPov: Record<string, VoiceAnchorBlock>
}

export type VoiceEntry = {
  characterId: string
  catchphrases: string[]
  sentenceLength?: string
  particles: string[]
  metaphorDomain: string[]
}

export type VoiceBankDoc = {
  version: number
  voices: Record<string, VoiceEntry>
}

/** Allowed keys for default / byPov[*]. Unknown keys (e.g. narrator) are ignored on read. */
export const VOICE_ANCHOR_BLOCK_KEYS = [
  'person',
  'tense',
  'sentence',
  'metaphorDensity',
  'lexicon',
  'notes'
] as const

function parseBlock(raw: unknown): VoiceAnchorBlock {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  // Agent footgun: "narrator" is not a schema key — map to notes.
  const notes =
    o.notes != null
      ? String(o.notes)
      : o.narrator != null
        ? String(o.narrator)
        : undefined
  return {
    person: o.person != null ? String(o.person) : undefined,
    tense: o.tense != null ? String(o.tense) : undefined,
    sentence: o.sentence != null ? String(o.sentence) : undefined,
    metaphorDensity: o.metaphorDensity != null ? String(o.metaphorDensity) : undefined,
    lexicon: o.lexicon != null ? String(o.lexicon) : undefined,
    notes
  }
}

/** Merge patch into prev; only known keys (incl. narrator→notes alias) stick. */
export function mergeVoiceAnchorBlock(
  prev: VoiceAnchorBlock,
  patch: unknown
): VoiceAnchorBlock {
  const next = parseBlock(patch)
  return {
    person: next.person ?? prev.person,
    tense: next.tense ?? prev.tense,
    sentence: next.sentence ?? prev.sentence,
    metaphorDensity: next.metaphorDensity ?? prev.metaphorDensity,
    lexicon: next.lexicon ?? prev.lexicon,
    notes: next.notes ?? prev.notes
  }
}

export function voiceAnchorSchemaHint(): string {
  return (
    'voice_anchor.default / byPov[<povId>] keys: person, tense, sentence, metaphorDensity, lexicon, notes. ' +
    'No "narrator" key — put tone prose in notes (narrator is accepted as alias→notes on write).'
  )
}

export function emptyVoiceAnchor(): VoiceAnchorDoc {
  return { version: 1, default: {}, byPov: {} }
}

export function parseVoiceAnchor(text: string): VoiceAnchorDoc {
  const raw = parseYamlDoc(text)
  if (!raw) return emptyVoiceAnchor()
  const byPov: Record<string, VoiceAnchorBlock> = {}
  if (raw.byPov && typeof raw.byPov === 'object') {
    for (const [k, v] of Object.entries(raw.byPov as Record<string, unknown>)) {
      byPov[k] = parseBlock(v)
    }
  }
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    default: parseBlock(raw.default),
    byPov
  }
}

export function serializeVoiceAnchor(doc: VoiceAnchorDoc): string {
  return dumpYamlDoc({
    version: doc.version || 1,
    default: doc.default,
    byPov: doc.byPov
  })
}

export function loadVoiceAnchor(workspaceRoot: string): {
  doc: VoiceAnchorDoc
  exists: boolean
  text: string
} {
  const abs = join(workspaceRoot, VOICE_ANCHOR_FILE)
  if (!existsSync(abs)) return { doc: emptyVoiceAnchor(), exists: false, text: '' }
  const text = readFileSync(abs, 'utf-8')
  return { doc: parseVoiceAnchor(text), exists: true, text }
}

export function emptyVoiceBank(): VoiceBankDoc {
  return { version: 1, voices: {} }
}

export function parseVoiceBank(text: string): VoiceBankDoc {
  const raw = parseYamlDoc(text)
  if (!raw) return emptyVoiceBank()
  const voices: Record<string, VoiceEntry> = {}
  const src =
    raw.voices && typeof raw.voices === 'object'
      ? (raw.voices as Record<string, unknown>)
      : {}
  for (const [key, val] of Object.entries(src)) {
    if (!val || typeof val !== 'object') continue
    const o = val as Record<string, unknown>
    const characterId = String(o.characterId || key)
    voices[key] = {
      characterId,
      catchphrases: asStringArray(o.catchphrases),
      sentenceLength: o.sentenceLength != null ? String(o.sentenceLength) : undefined,
      particles: asStringArray(o.particles),
      metaphorDomain: asStringArray(o.metaphorDomain)
    }
  }
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    voices
  }
}

export function serializeVoiceBank(doc: VoiceBankDoc): string {
  return dumpYamlDoc({ version: doc.version || 1, voices: doc.voices })
}

export function loadVoiceBank(workspaceRoot: string): {
  doc: VoiceBankDoc
  exists: boolean
  text: string
} {
  const abs = join(workspaceRoot, VOICE_BANK_FILE)
  if (!existsSync(abs)) return { doc: emptyVoiceBank(), exists: false, text: '' }
  const text = readFileSync(abs, 'utf-8')
  return { doc: parseVoiceBank(text), exists: true, text }
}

export function upsertVoice(
  doc: VoiceBankDoc,
  patch: Partial<VoiceEntry> & { characterId: string },
  key?: string
): VoiceBankDoc {
  const k = key || patch.characterId
  const prev = doc.voices[k]
  const next: VoiceEntry = {
    characterId: patch.characterId,
    catchphrases: patch.catchphrases ?? prev?.catchphrases ?? [],
    sentenceLength: patch.sentenceLength ?? prev?.sentenceLength,
    particles: patch.particles ?? prev?.particles ?? [],
    metaphorDomain: patch.metaphorDomain ?? prev?.metaphorDomain ?? []
  }
  return { ...doc, voices: { ...doc.voices, [k]: next } }
}

export type ContinuityIssue = {
  severity: 'error' | 'warn' | 'info'
  kind: string
  path: string
  quote: string
  suggestion: string
}

/** Thin stats: sentence length vs anchor keyword; catchphrase hit rate. */
export function compareVoiceStats(
  text: string,
  path: string,
  anchor: VoiceAnchorBlock,
  bank?: VoiceEntry
): ContinuityIssue[] {
  const issues: ContinuityIssue[] = []
  const sentences = text
    .split(/[。！？.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (!sentences.length) return issues

  const lengths = sentences.map((s) => s.length)
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
  const wantsShort =
    /短/.test(anchor.sentence || '') ||
    bank?.sentenceLength === 'short' ||
    /短/.test(bank?.sentenceLength || '')
  const wantsLong =
    /长/.test(anchor.sentence || '') ||
    bank?.sentenceLength === 'long' ||
    /长/.test(bank?.sentenceLength || '')

  if (wantsShort && avg > 42) {
    issues.push({
      severity: 'warn',
      kind: 'voice_drift',
      path,
      quote: sentences[0].slice(0, 48),
      suggestion: `Avg sentence length ${avg.toFixed(1)} chars — anchor prefers short sentences.`
    })
  }
  if (wantsLong && avg < 18 && sentences.length >= 5) {
    issues.push({
      severity: 'warn',
      kind: 'voice_drift',
      path,
      quote: sentences[0].slice(0, 48),
      suggestion: `Avg sentence length ${avg.toFixed(1)} chars — anchor prefers longer sentences.`
    })
  }

  if (bank?.catchphrases?.length) {
    let hits = 0
    for (const p of bank.catchphrases) {
      if (p && text.includes(p)) hits++
    }
    if (hits === 0 && text.length > 400) {
      issues.push({
        severity: 'info',
        kind: 'voice_drift',
        path,
        quote: '',
        suggestion: `No catchphrases from voice bank (${bank.catchphrases.slice(0, 3).join('、')}) found — check character voice.`
      })
    }
  }
  return issues
}
