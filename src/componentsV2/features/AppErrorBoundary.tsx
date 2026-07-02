import type { ErrorInfo, ReactNode } from 'react'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('AppErrorBoundary')

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('React render error captured', error, errorInfo, { logToFile: true })
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>页面渲染出错</Text>
        <Text style={styles.message}>应用已拦截本次异常，避免直接闪退。请重启 App 后继续使用。</Text>
        <Text style={styles.detail} selectable>
          {this.state.error.message}
        </Text>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff'
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 16
  },
  detail: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6b7280',
    textAlign: 'center'
  }
})
