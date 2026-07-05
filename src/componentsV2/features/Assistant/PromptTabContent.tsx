import { Button } from 'heroui-native'
import { MotiView } from 'moti'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'

import Text from '@/componentsV2/base/Text'
import TextField from '@/componentsV2/base/TextField'
import { presentPromptDetailSheet } from '@/componentsV2/features/Sheet/PromptDetailSheet'
import XStack from '@/componentsV2/layout/XStack'
import YStack from '@/componentsV2/layout/YStack'
import type { Assistant } from '@/types/assistant'
import { PROMPT_VARIABLES } from '@/utils/promptVariables'

interface PromptTabContentProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => void
}

export function PromptTabContent({ assistant, updateAssistant }: PromptTabContentProps) {
  const { t } = useTranslation()

  const [formData, setFormData] = useState({
    name: assistant?.name || '',
    prompt: assistant?.prompt || ''
  })

  useEffect(() => {
    setFormData({
      name: assistant?.name || '',
      prompt: assistant?.prompt || ''
    })
  }, [assistant])

  const handleSave = () => {
    if (formData.name !== assistant.name || formData.prompt !== assistant.prompt) {
      updateAssistant({
        ...assistant,
        name: formData.name,
        prompt: formData.prompt
      })
    }
  }

  const appendPromptVariable = (variable: string) => {
    const separator = formData.prompt.trim().length ? '\n' : ''
    const prompt = `${formData.prompt}${separator}${variable}`
    setFormData(prev => ({ ...prev, prompt }))
    updateAssistant({ ...assistant, name: formData.name, prompt })
  }

  return (
    <MotiView
      style={{ flex: 1 }}
      from={{ opacity: 0, translateY: 10 }}
      animate={{
        translateY: 0,
        opacity: 1
      }}
      exit={{ opacity: 1, translateY: -10 }}
      transition={{
        type: 'timing'
      }}>
      <KeyboardAvoidingView className="h-full flex-1">
        <YStack className="flex-1 gap-4">
          <TextField className="gap-2">
            <TextField.Label className="text-foreground-secondary text-sm font-medium">
              {t('common.name')}
            </TextField.Label>
            <TextField.Input
              className="h-12 rounded-lg  px-3 py-0 text-sm"
              placeholder={t('assistants.name')}
              value={formData.name}
              onChangeText={name => setFormData(prev => ({ ...prev, name }))}
              onEndEditing={handleSave}
            />
          </TextField>

          <YStack className="gap-2">
            <Text className="text-foreground-secondary text-xs font-medium">助手变量</Text>
            <XStack className="flex-wrap gap-2">
              {PROMPT_VARIABLES.map(variable => (
                <Button
                  key={variable.key}
                  size="sm"
                  variant="tertiary"
                  className="bg-card h-8 rounded-xl border-0 px-2"
                  onPress={() => appendPromptVariable(variable.key)}>
                  <Button.Label className="text-xs">{variable.key}</Button.Label>
                </Button>
              ))}
            </XStack>
            <Text className="text-foreground-secondary text-xs opacity-60">
              发送时自动替换为当前日期、时间、模型、助手名称等信息。
            </Text>
          </YStack>

          <TextField className="flex-1 gap-2">
            <TextField.Label className="text-foreground-secondary text-sm font-medium">
              {t('common.prompt')}
            </TextField.Label>
            <Pressable
              className="flex-1"
              onPress={() => {
                presentPromptDetailSheet(
                  formData.prompt,
                  prompt => setFormData(prev => ({ ...prev, prompt })),
                  t('common.prompt'),
                  prompt => {
                    if (prompt !== assistant.prompt) {
                      updateAssistant({ ...assistant, prompt })
                    }
                  }
                )
              }}>
              <TextField.Input
                editable={false}
                pointerEvents="none"
                className="flex-1 rounded-lg px-3 py-3 text-sm"
                placeholder={t('common.prompt')}
                multiline
                numberOfLines={20}
                textAlignVertical="top"
                value={formData.prompt}
              />
            </Pressable>
          </TextField>
        </YStack>
      </KeyboardAvoidingView>
    </MotiView>
  )
}
