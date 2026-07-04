export type PresetKind = 'sillytavern' | 'sampling' | 'instruct' | 'openai' | 'unknown'

export interface PresetEntry {
  identifier: string
  name: string
  role?: string
  enabled: boolean
  marker?: boolean
  hasContent: boolean
}

export interface GenerationPreset {
  id: string
  name: string
  kind: PresetKind
  source: 'manual' | 'sillytavern'
  createdAt: number
  updatedAt: number
  raw: Record<string, any>
  entries?: PresetEntry[]
  settings: {
    temperature?: number
    topP?: number
    maxTokens?: number
    streamOutput?: boolean
    systemPrompt?: string
    customParameters?: Record<string, any>
    stopSequences?: string[]
  }
}
