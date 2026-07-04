export type PresetKind = 'sillytavern' | 'sampling' | 'instruct' | 'openai' | 'unknown'

export interface GenerationPreset {
  id: string
  name: string
  kind: PresetKind
  source: 'manual' | 'sillytavern'
  createdAt: number
  updatedAt: number
  raw: Record<string, any>
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
