import * as DocumentPicker from 'expo-document-picker'
import { File, Paths } from 'expo-file-system'
import * as FileSystem from 'expo-file-system/legacy'

import type { Assistant, AssistantSettingCustomParameters } from '@/types/assistant'
import type { GenerationPreset, PresetEntry, PresetKind } from '@/types/preset'
import { saveFileToFolder } from '@/services/FileService'
import { storage, uuid } from '@/utils'
import { removeSpecialCharactersForFileName } from '@/utils/file'

import { loggerService } from './LoggerService'

const logger = loggerService.withContext('PresetService')
const PRESETS_STORAGE_KEY = 'generation_presets_v1'

const numberFrom = (...values: any[]): number | undefined => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

const booleanFrom = (...values: any[]): boolean | undefined => {
  for (const value of values) {
    if (typeof value === 'boolean') return value
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return undefined
}

const stringFrom = (...values: any[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

const detectPresetKind = (raw: Record<string, any>): PresetKind => {
  if (Array.isArray(raw.prompts) || raw.prompt_order) return 'openai'
  if ('input_sequence' in raw || 'output_sequence' in raw || 'story_string_prefix' in raw) return 'instruct'
  if ('temp' in raw || 'top_p' in raw || 'rep_pen' in raw || 'sampler_order' in raw || 'sampler_priority' in raw) {
    return 'sampling'
  }
  return 'unknown'
}

const getPresetName = (raw: Record<string, any>, fallbackName: string) => {
  return (
    stringFrom(raw.name, raw.display_name, raw.preset_name, raw.id) || fallbackName.replace(/\.json$/i, '') || 'Preset'
  )
}

const compileSillyTavernMacros = (content: string): string => {
  const vars: Record<string, string> = {}

  return content.replace(
    /{{(\/\/[\s\S]*?|setglobalvar::([^:}]+)::([\s\S]*?)|addglobalvar::([^:}]+)::([\s\S]*?)|getglobalvar::([^}]+))}}/g,
    (
      _match,
      _body: string,
      setKey?: string,
      setValue?: string,
      addKey?: string,
      addValue?: string,
      getKey?: string
    ) => {
      if (setKey !== undefined) {
        vars[setKey.trim()] = setValue || ''
        return ''
      }

      if (addKey !== undefined) {
        const normalizedKey = addKey.trim()
        vars[normalizedKey] = `${vars[normalizedKey] || ''}${addValue || ''}`
        return ''
      }

      if (getKey !== undefined) {
        return vars[getKey.trim()] || ''
      }

      return ''
    }
  )
}

const getPromptOrder = (raw: Record<string, any>): any[] | null => {
  const orderRoot = Array.isArray(raw.prompt_order) ? raw.prompt_order[0] : null
  const order = Array.isArray(orderRoot?.order) ? orderRoot.order : null
  return order || null
}

const getEnabledPromptIdentifiers = (raw: Record<string, any>): string[] | null => {
  const order = getPromptOrder(raw)
  if (!order) return null

  return order.filter((item: any) => item?.enabled !== false).map((item: any) => String(item.identifier))
}

const extractPresetEntries = (raw: Record<string, any>): PresetEntry[] | undefined => {
  if (!Array.isArray(raw.prompts)) return undefined

  const promptMap = new Map(raw.prompts.map((prompt: any) => [String(prompt.identifier), prompt]))
  const order = getPromptOrder(raw)

  const orderedItems = order
    ? order
        .map((item: any) => {
          const prompt = promptMap.get(String(item.identifier))
          return prompt ? { prompt, orderItem: item } : null
        })
        .filter(Boolean)
    : raw.prompts.map((prompt: any) => ({ prompt, orderItem: undefined }))

  return orderedItems.map((item: any) => {
    const prompt = item.prompt
    const orderItem = item.orderItem

    return {
      identifier: String(prompt.identifier),
      name: stringFrom(prompt.name, prompt.identifier) || '未命名条目',
      role: stringFrom(prompt.role),
      enabled: orderItem?.enabled ?? prompt.enabled !== false,
      marker: !!(orderItem?.marker ?? prompt.marker),
      hasContent: !!stringFrom(prompt.content, prompt.prompt)
    }
  })
}

const extractPromptManagerSystemPrompt = (raw: Record<string, any>): string | undefined => {
  if (!Array.isArray(raw.prompts)) return undefined

  const enabledIdentifiers = getEnabledPromptIdentifiers(raw)
  const promptMap = new Map(raw.prompts.map((prompt: any) => [String(prompt.identifier), prompt]))
  const orderedPrompts = enabledIdentifiers
    ? enabledIdentifiers.map(identifier => promptMap.get(identifier)).filter(Boolean)
    : raw.prompts.filter((prompt: any) => prompt?.enabled !== false)

  const parts = orderedPrompts
    .filter((prompt: any) => prompt?.enabled !== false)
    .filter((prompt: any) => !prompt?.marker)
    .map((prompt: any) => stringFrom(prompt?.content, prompt?.prompt))
    .filter((content): content is string => !!content)

  if (!parts.length) return undefined
  return compileSillyTavernMacros(parts.join('\n\n')).trim()
}

const extractSystemPrompt = (raw: Record<string, any>): string | undefined => {
  const direct = stringFrom(raw.system_prompt, raw.systemPrompt, raw.system, raw.prompt)
  if (direct) return compileSillyTavernMacros(direct).trim()

  const promptManagerPrompt = extractPromptManagerSystemPrompt(raw)
  if (promptManagerPrompt) return promptManagerPrompt

  if (Array.isArray(raw.prompts)) {
    const systemPrompt = raw.prompts.find((prompt: any) => {
      const identifier = String(prompt?.identifier ?? prompt?.id ?? prompt?.name ?? '').toLowerCase()
      const role = String(prompt?.role ?? '').toLowerCase()
      return role === 'system' || identifier.includes('system') || identifier.includes('main')
    })
    const content = stringFrom(systemPrompt?.content, systemPrompt?.prompt)
    return content ? compileSillyTavernMacros(content).trim() : undefined
  }

  const prefix = stringFrom(raw.story_string_prefix)
  const suffix = stringFrom(raw.story_string_suffix)
  const alignment = stringFrom(raw.user_alignment_message)
  const instructParts = [prefix, alignment, suffix].filter(Boolean)
  return instructParts.length ? compileSillyTavernMacros(instructParts.join('\n')).trim() : undefined
}

const extractStopSequences = (raw: Record<string, any>): string[] | undefined => {
  const stopValues = [raw.stop_sequence, raw.stop, raw.stop_sequences, raw.stopStrings, raw.custom_stopping_strings]
  const stops = stopValues.flatMap(value => {
    if (!value) return []
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      if (!value.trim()) return []
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed
      } catch {}
      return [value]
    }
    return []
  })
  const normalized = [...new Set(stops.filter((item): item is string => typeof item === 'string' && item.length > 0))]
  return normalized.length ? normalized : undefined
}

const extractCustomParameters = (raw: Record<string, any>): Record<string, any> => {
  const mapping: Record<string, any> = {
    top_k: raw.top_k,
    min_p: raw.min_p,
    top_a: raw.top_a,
    typical_p: raw.typical_p ?? raw.typical,
    repetition_penalty: raw.rep_pen ?? raw.repetition_penalty,
    frequency_penalty: raw.freq_pen ?? raw.frequency_penalty,
    presence_penalty: raw.presence_pen ?? raw.presence_penalty,
    reasoning_effort: raw.reasoning_effort,
    verbosity: raw.verbosity,
    squash_system_messages: raw.squash_system_messages,
    mirostat: raw.mirostat ?? raw.mirostat_mode,
    mirostat_tau: raw.mirostat_tau,
    mirostat_eta: raw.mirostat_eta,
    seed: raw.seed,
    grammar: raw.grammar ?? raw.grammar_string,
    negative_prompt: raw.negative_prompt,
    stop: extractStopSequences(raw)
  }

  return Object.fromEntries(Object.entries(mapping).filter(([, value]) => value !== undefined && value !== ''))
}

export const parseSillyTavernPreset = (raw: Record<string, any>, fallbackName = 'Preset'): GenerationPreset => {
  const now = Date.now()
  const kind = detectPresetKind(raw)
  const maxTokens = numberFrom(raw.openai_max_tokens, raw.max_tokens, raw.maxTokens, raw.amount_gen, raw.genamt)
  const systemPrompt = extractSystemPrompt(raw)
  const entries = extractPresetEntries(raw)

  return {
    id: uuid(),
    name: getPresetName(raw, fallbackName),
    kind,
    source: 'sillytavern',
    createdAt: now,
    updatedAt: now,
    raw,
    entries,
    settings: {
      temperature: numberFrom(raw.temperature, raw.temp),
      topP: numberFrom(raw.top_p, raw.topP),
      maxTokens: maxTokens && maxTokens > 0 ? maxTokens : undefined,
      streamOutput: booleanFrom(raw.stream_openai, raw.streaming, raw.stream),
      systemPrompt,
      stopSequences: extractStopSequences(raw),
      customParameters: extractCustomParameters(raw)
    }
  }
}

const customParametersToAssistantSettings = (
  customParameters?: Record<string, any>
): AssistantSettingCustomParameters[] => {
  if (!customParameters) return []
  return Object.entries(customParameters).map(([name, value]) => {
    const type =
      typeof value === 'boolean'
        ? 'boolean'
        : typeof value === 'number'
          ? 'number'
          : typeof value === 'string'
            ? 'string'
            : 'json'
    return {
      name,
      value: type === 'json' ? JSON.stringify(value) : value,
      type
    } as AssistantSettingCustomParameters
  })
}

class PresetService {
  getPresets(): GenerationPreset[] {
    const raw = storage.getString(PRESETS_STORAGE_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (error) {
      logger.error('Failed to parse presets storage', error as Error)
      return []
    }
  }

  savePresets(presets: GenerationPreset[]) {
    storage.set(PRESETS_STORAGE_KEY, JSON.stringify(presets))
  }

  getPreset(id?: string): GenerationPreset | undefined {
    if (!id) return undefined
    return this.getPresets().find(preset => preset.id === id)
  }

  upsertPreset(preset: GenerationPreset) {
    const presets = this.getPresets()
    const index = presets.findIndex(item => item.id === preset.id)
    const updatedPreset = { ...preset, updatedAt: Date.now() }
    if (index >= 0) {
      presets[index] = updatedPreset
    } else {
      presets.unshift(updatedPreset)
    }
    this.savePresets(presets)
    return updatedPreset
  }

  deletePreset(id: string) {
    this.savePresets(this.getPresets().filter(preset => preset.id !== id))
  }

  getPresetEntryContent(presetId: string, identifier: string): string {
    const preset = this.getPreset(presetId)
    if (!preset || !Array.isArray(preset.raw.prompts)) return ''

    const prompt = preset.raw.prompts.find((item: any) => String(item.identifier) === identifier)
    return stringFrom(prompt?.content, prompt?.prompt) || ''
  }

  updatePresetEntryContent(presetId: string, identifier: string, content: string): GenerationPreset | undefined {
    const preset = this.getPreset(presetId)
    if (!preset || !Array.isArray(preset.raw.prompts)) return preset

    const raw = {
      ...preset.raw,
      prompts: preset.raw.prompts.map((prompt: any) => {
        if (String(prompt.identifier) !== identifier) return prompt
        return { ...prompt, content }
      })
    }

    const nextPreset: GenerationPreset = {
      ...preset,
      raw,
      entries: extractPresetEntries(raw),
      settings: {
        ...preset.settings,
        systemPrompt: extractSystemPrompt(raw)
      }
    }

    return this.upsertPreset(nextPreset)
  }

  togglePresetEntry(presetId: string, identifier: string): GenerationPreset | undefined {
    const preset = this.getPreset(presetId)
    if (!preset?.entries) return preset

    const entries = preset.entries.map(entry =>
      entry.identifier === identifier ? { ...entry, enabled: !entry.enabled } : entry
    )
    const raw = { ...preset.raw }

    if (Array.isArray(raw.prompts)) {
      raw.prompts = raw.prompts.map((prompt: any) => {
        if (String(prompt.identifier) !== identifier) return prompt
        const entry = entries.find(candidate => candidate.identifier === identifier)
        return { ...prompt, enabled: entry?.enabled ?? prompt.enabled }
      })
    }

    if (Array.isArray(raw.prompt_order)) {
      raw.prompt_order = raw.prompt_order.map((orderRoot: any) => ({
        ...orderRoot,
        order: Array.isArray(orderRoot.order)
          ? orderRoot.order.map((item: any) => {
              if (String(item.identifier) !== identifier) return item
              const entry = entries.find(candidate => candidate.identifier === identifier)
              return { ...item, enabled: entry?.enabled ?? item.enabled }
            })
          : orderRoot.order
      }))
    }

    const nextPreset: GenerationPreset = {
      ...preset,
      raw,
      entries,
      settings: {
        ...preset.settings,
        systemPrompt: extractSystemPrompt(raw)
      }
    }

    return this.upsertPreset(nextPreset)
  }

  async importSillyTavernPresetFromFile(): Promise<GenerationPreset | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
      multiple: false
    })

    if (result.canceled || !result.assets?.[0]) return null

    const asset = result.assets[0]
    const content = await new File(asset.uri).text()
    const raw = JSON.parse(content)
    const preset = parseSillyTavernPreset(raw, asset.name || 'Preset')
    return this.upsertPreset(preset)
  }

  async exportPresetToFile(presetId: string) {
    const preset = this.getPreset(presetId)
    if (!preset) return { success: false, message: 'Preset not found.' }

    const fileName = `${removeSpecialCharactersForFileName(preset.name) || 'preset'}.json`
    const tempUri = `${Paths.cache.uri}${fileName}`

    await FileSystem.writeAsStringAsync(tempUri, JSON.stringify(preset.raw, null, 2), {
      encoding: FileSystem.EncodingType.UTF8
    })

    try {
      return await saveFileToFolder(tempUri, fileName, 'application/json')
    } finally {
      await FileSystem.deleteAsync(tempUri, { idempotent: true })
    }
  }

  applyPresetToAssistant(assistant: Assistant, preset?: GenerationPreset): Assistant {
    if (!preset) return assistant

    const nextSettings = {
      ...assistant.settings,
      presetId: preset.id,
      ...(preset.settings.temperature !== undefined
        ? { temperature: preset.settings.temperature, enableTemperature: true }
        : undefined),
      ...(preset.settings.topP !== undefined ? { topP: preset.settings.topP, enableTopP: true } : undefined),
      ...(preset.settings.maxTokens !== undefined
        ? { maxTokens: preset.settings.maxTokens, enableMaxTokens: true }
        : undefined),
      ...(preset.settings.streamOutput !== undefined ? { streamOutput: preset.settings.streamOutput } : undefined),
      customParameters: customParametersToAssistantSettings(preset.settings.customParameters)
    }

    return {
      ...assistant,
      prompt: preset.settings.systemPrompt ?? assistant.prompt,
      settings: nextSettings
    }
  }
}

export const presetService = new PresetService()
