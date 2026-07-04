import { TrueSheet } from '@lodev09/react-native-true-sheet'
import React, { useEffect, useMemo, useState } from 'react'

import type { SelectionSheetItem } from '@/componentsV2/base/SelectionSheet'
import SelectionSheet from '@/componentsV2/base/SelectionSheet'
import Text from '@/componentsV2/base/Text'
import YStack from '@/componentsV2/layout/YStack'
import { presetService } from '@/services/PresetService'
import type { Assistant } from '@/types/assistant'
import type { GenerationPreset } from '@/types/preset'

const SHEET_NAME = 'PresetSheet'

interface PresetSheetData {
  assistant?: Assistant
  updateAssistant?: (assistant: Assistant) => Promise<void>
}

let currentSheetData: PresetSheetData = {}
let updateSheetDataCallback: ((data: PresetSheetData) => void) | null = null

export const presentPresetSheet = (data: PresetSheetData) => {
  currentSheetData = data
  updateSheetDataCallback?.(data)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissPresetSheet = () => TrueSheet.dismiss(SHEET_NAME)

const getPresetDescription = (preset: GenerationPreset) => {
  const parts: string[] = [preset.kind]
  if (preset.settings.temperature !== undefined) parts.push(`T ${preset.settings.temperature}`)
  if (preset.settings.topP !== undefined) parts.push(`P ${preset.settings.topP}`)
  if (preset.settings.maxTokens !== undefined) parts.push(`${preset.settings.maxTokens} tokens`)
  return parts.join(' · ')
}

export const PresetSheet: React.FC = () => {
  const [sheetData, setSheetData] = useState<PresetSheetData>(currentSheetData)
  const [presets, setPresets] = useState<GenerationPreset[]>(() => presetService.getPresets())

  useEffect(() => {
    updateSheetDataCallback = setSheetData
    return () => {
      updateSheetDataCallback = null
    }
  }, [])

  const refresh = () => setPresets(presetService.getPresets())

  const importPreset = async () => {
    const preset = await presetService.importSillyTavernPresetFromFile()
    refresh()
    if (preset && sheetData.assistant && sheetData.updateAssistant) {
      await applyAssistantUpdate(presetService.applyPresetToAssistant(sheetData.assistant, preset))
    }
  }

  const currentPresetId = sheetData.assistant?.settings?.presetId
  const currentPreset = presets.find(preset => preset.id === currentPresetId)

  const applyAssistantUpdate = async (assistant: Assistant) => {
    setSheetData(prev => ({ ...prev, assistant }))
    await sheetData.updateAssistant?.(assistant)
  }

  const reapplyPresetIfNeeded = async (preset?: GenerationPreset) => {
    if (!preset || !sheetData.assistant || !sheetData.updateAssistant || preset.id !== currentPresetId) return
    await applyAssistantUpdate(presetService.applyPresetToAssistant(sheetData.assistant, preset))
  }

  const items: SelectionSheetItem[] = useMemo(() => {
    const result: SelectionSheetItem[] = [
      {
        id: 'import',
        label: '导入酒馆预设 JSON',
        description: '支持 SillyTavern sampler / instruct / OpenAI 预设',
        onSelect: importPreset,
        shouldDismiss: false
      },
      {
        id: 'none',
        label: '不使用预设',
        description: '保留当前助手参数',
        isSelected: !currentPresetId,
        onSelect: async () => {
          if (!sheetData.assistant || !sheetData.updateAssistant) return
          await applyAssistantUpdate({
            ...sheetData.assistant,
            settings: { ...sheetData.assistant.settings, presetId: undefined }
          })
        }
      },
      ...presets.map(preset => ({
        id: preset.id,
        label: preset.name,
        description: getPresetDescription(preset),
        isSelected: preset.id === currentPresetId,
        shouldDismiss: false,
        onSelect: async () => {
          if (!sheetData.assistant || !sheetData.updateAssistant) return
          await applyAssistantUpdate(presetService.applyPresetToAssistant(sheetData.assistant, preset))
        }
      })),
      ...(currentPreset?.entries?.length
        ? [
            {
              id: 'entries-title',
              label: '当前预设条目开关',
              description: '点击条目即可启用/禁用，灰色表示没有实际文本内容',
              shouldDismiss: false,
              onSelect: () => {}
            },
            ...currentPreset.entries.map(entry => ({
              id: `entry-${entry.identifier}`,
              label: `${entry.enabled ? '🟠' : '⚪'} ${entry.name}`,
              description: `${entry.role || 'prompt'}${entry.marker ? ' · 占位' : ''}${entry.hasContent ? '' : ' · 空内容'}`,
              color: !entry.hasContent ? 'opacity-45' : undefined,
              shouldDismiss: false,
              onSelect: async () => {
                if (!currentPresetId) return
                const updatedPreset = presetService.togglePresetEntry(currentPresetId, entry.identifier)
                refresh()
                await reapplyPresetIfNeeded(updatedPreset)
              }
            }))
          ]
        : [])
    ]
    return result
  }, [currentPresetId, presets, sheetData.assistant, sheetData.updateAssistant])

  return (
    <SelectionSheet
      name={SHEET_NAME}
      detents={['auto', 0.75]}
      items={items}
      placeholder="预设会覆盖助手的系统提示词、温度、TopP、最大输出和自定义采样参数。"
      emptyContent={
        <YStack className="items-center gap-2 py-4">
          <Text className="text-center opacity-60">暂无预设，请先导入 SillyTavern JSON。</Text>
        </YStack>
      }
    />
  )
}
