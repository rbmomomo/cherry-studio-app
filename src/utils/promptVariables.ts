import { Platform } from 'react-native'

import type { Assistant, Model } from '@/types/assistant'

const pad = (value: number) => value.toString().padStart(2, '0')

const formatDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const formatTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

export const PROMPT_VARIABLES = [
  { key: '{cur_date}', description: '当前日期' },
  { key: '{cur_time}', description: '当前时间' },
  { key: '{cur_datetime}', description: '当前日期时间' },
  { key: '{model_id}', description: '模型 ID' },
  { key: '{model_name}', description: '模型名称' },
  { key: '{assistant_name}', description: '助手名称' },
  { key: '{locale}', description: '设备语言' },
  { key: '{timezone}', description: '时区' },
  { key: '{system_version}', description: '系统版本' }
] as const

export type PromptVariableKey = (typeof PROMPT_VARIABLES)[number]['key']

export const buildPromptVariables = (assistant: Assistant, model?: Model) => {
  const now = new Date()
  const date = formatDate(now)
  const time = formatTime(now)
  const locale = Intl.DateTimeFormat().resolvedOptions().locale
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''

  return {
    '{cur_date}': date,
    '{cur_time}': time,
    '{cur_datetime}': `${date} ${time}`,
    '{model_id}': model?.id || model?.name || '',
    '{model_name}': model?.name || model?.id || '',
    '{assistant_name}': assistant.name || '',
    '{locale}': locale,
    '{timezone}': timezone,
    '{system_version}': `${Platform.OS} ${Platform.Version}`
  } satisfies Record<PromptVariableKey, string>
}

export const replacePromptVariables = (text: string, assistant: Assistant, model?: Model) => {
  if (!text) return text

  const variables = buildPromptVariables(assistant, model)
  return Object.entries(variables).reduce((result, [key, value]) => result.replaceAll(key, value), text)
}
