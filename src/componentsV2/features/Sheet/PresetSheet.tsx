import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Switch } from 'heroui-native'
import React, { useEffect, useState } from 'react'

import type { SelectionSheetItem } from '@/componentsV2/base/SelectionSheet'
import SelectionSheet from '@/componentsV2/base/SelectionSheet'
import { presentDialog } from '@/componentsV2/base/Dialog/useDialogManager'
import Text from '@/componentsV2/base/Text'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import { presentPromptDetailSheet } from '@/componentsV2/features/Sheet/PromptDetailSheet'
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

  const enabledEntryCount = currentPreset?.entries?.filter(entry => entry.enabled).length ?? 0
  const totalEntryCount = currentPreset?.entries?.length ?? 0

  const createEntryToggleHandler = (identifier: string) => async () => {
    if (!currentPresetId) return
    const updatedPreset = presetService.togglePresetEntry(currentPresetId, identifier)
    refresh()
    await reapplyPresetIfNeeded(updatedPreset)
  }

  const createEntryEditHandler = (identifier: string, name: string) => () => {
    if (!currentPresetId) return

    let draft = presetService.getPresetEntryContent(currentPresetId, identifier)
    presentPromptDetailSheet(
      draft,
      text => {
        draft = text
      },
      `编辑条目：${name}`,
      async text => {
        if (!currentPresetId || text === presetService.getPresetEntryContent(currentPresetId, identifier)) return
        const updatedPreset = presetService.updatePresetEntryContent(currentPresetId, identifier, text)
        refresh()
        await reapplyPresetIfNeeded(updatedPreset)
      }
    )
  }

  const confirmDeleteCurrentPreset = () => {
    if (!currentPreset) return

    presentDialog('warning', {
      title: '删除预设',
      content: `确定删除预设「${currentPreset.name}」吗？此操作不会删除当前助手已写入的提示词，但会移除预设记录。`,
      confirmText: '删除',
      showCancel: true,
      onConfirm: async () => {
        const deletingCurrentPresetId = currentPreset.id
        presetService.deletePreset(deletingCurrentPresetId)
        refresh()

        if (sheetData.assistant?.settings?.presetId === deletingCurrentPresetId) {
          await applyAssistantUpdate({
            ...sheetData.assistant,
            settings: { ...sheetData.assistant.settings, presetId: undefined }
          })
        }
      }
    })
  }

  const items: SelectionSheetItem[] = [
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
    ...(currentPreset
      ? [
          {
            id: 'delete-current-preset',
            label: '删除当前预设',
            description: `删除「${currentPreset.name}」的预设记录`,
            color: 'text-red-400',
            shouldDismiss: false,
            onSelect: confirmDeleteCurrentPreset
          }
        ]
      : []),
    ...(currentPreset?.entries?.length
      ? [
          {
            id: 'entries-title',
            label: '当前预设条目开关',
            description: `已启用 ${enabledEntryCount}/${totalEntryCount} 条。点击条目或右侧开关即可启用/禁用`,
            shouldDismiss: false,
            onSelect: () => {}
          },
          ...currentPreset.entries.map(entry => {
            const handleToggle = createEntryToggleHandler(entry.identifier)
            const handleEdit = createEntryEditHandler(entry.identifier, entry.name)

            return {
              id: `entry-${entry.identifier}`,
              label: (
                <XStack className="min-w-0 flex-1 items-center gap-2">
                  <Text className="text-base">{entry.enabled ? '🟠' : '⚪'}</Text>
                  <Text
                    className={`min-w-0 flex-1 text-base ${entry.enabled ? 'text-foreground' : 'text-foreground-secondary opacity-60'} ${!entry.hasContent ? 'opacity-45' : ''}`}
                    numberOfLines={1}
                    ellipsizeMode="tail">
                    {entry.name}
                  </Text>
                </XStack>
              ),
              description: `${entry.role || 'prompt'}${entry.marker ? ' · 占位' : ''}${entry.hasContent ? '' : ' · 空内容'}`,
              shouldDismiss: false,
              onSelect: handleEdit,
              icon: (
                <Switch
                  isSelected={entry.enabled}
                  onSelectedChange={handleToggle}
                  isDisabled={!entry.hasContent && !entry.enabled}
                />
              )
            }
          })
        ]
      : [])
  ]

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
