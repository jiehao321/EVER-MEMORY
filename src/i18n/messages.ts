export type Locale = 'zh' | 'en' | 'auto';

export const messages = {
  zh: {
    status: {
      nudges: {
        atRisk: '{n} 条记忆即将被归档。请访问它们，或使用 evermemory_store 刷新。',
      },
      health: {
        healthy: '健康',
        warning: '警告',
        critical: '严重',
      },
      warnings: {
        atRisk: '存在即将归档的记忆',
      },
    },
    recall: {
      noMatchNudge: '未匹配到记忆。请尝试更宽泛的关键词，或通过 evermemory_status 检查是否已有记忆。',
      strategy: {
        keyword: '关键词',
        semantic: '语义',
        hybrid: '混合',
        structured: '结构化',
      },
    },
    smartness: {
      reportHeader: '🧠 智能度评分：',
      dimensions: {
        identity: '身份记忆',
        preferences: '偏好记忆',
        continuity: '连续性',
        learning: '学习沉淀',
      },
      advice: {
        header: '改进建议',
        identity: '记录更多身份信息与长期背景。',
        preferences: '记录稳定偏好与约束条件。',
        continuity: '用 evermemory_store 保存当前项目上下文。',
        learning: '沉淀 lesson 与 warning 类型记忆。',
      },
    },
    onboard: {
      welcome: '欢迎使用 EverMemory。',
      firstRunGuidance: '首次运行时，先记录你的身份、偏好与当前项目背景。',
      toolIntro: '常用工具：evermemory_store 用于写入记忆，evermemory_status 用于检查状态。',
    },
    doctor: {
      diagnosticsHeader: '诊断结果',
      databaseOk: '数据库连接正常。',
      databaseWarning: '数据库状态异常，请检查配置或权限。',
      embeddingsReady: '嵌入能力已就绪。',
      embeddingsUnavailable: '嵌入能力不可用，系统将回退到非语义模式。',
    },
    general: {
      ready: '就绪',
      degraded: '降级',
      disabled: '禁用',
      labels: {
        yes: '是',
        no: '否',
        unknown: '未知',
      },
    },
  },
  en: {
    status: {
      nudges: {
        atRisk: '{n} memories will be archived soon. Access them or use evermemory_store to refresh.',
      },
      health: {
        healthy: 'healthy',
        warning: 'warning',
        critical: 'critical',
      },
      warnings: {
        atRisk: 'Memories are at risk of being archived soon.',
      },
    },
    recall: {
      noMatchNudge: 'No memories matched. Try broader terms or check if memories exist via evermemory_status.',
      strategy: {
        keyword: 'keyword',
        semantic: 'semantic',
        hybrid: 'hybrid',
        structured: 'structured',
      },
    },
    smartness: {
      reportHeader: 'Smart Score:',
      dimensions: {
        identity: 'Identity',
        preferences: 'Preferences',
        continuity: 'Continuity',
        learning: 'Learning',
      },
      advice: {
        header: 'Advice',
        identity: 'Record more identity and long-term background memories.',
        preferences: 'Capture stable preferences and constraints.',
        continuity: 'Use evermemory_store to preserve current project context.',
        learning: 'Store lesson and warning memories to improve future recall.',
      },
    },
    onboard: {
      welcome: 'Welcome to EverMemory.',
      firstRunGuidance: 'On first run, store your identity, preferences, and current project context.',
      toolIntro: 'Common tools: evermemory_store writes memories and evermemory_status checks system state.',
    },
    doctor: {
      diagnosticsHeader: 'Diagnostics',
      databaseOk: 'Database connection is healthy.',
      databaseWarning: 'Database state looks degraded. Check configuration or permissions.',
      embeddingsReady: 'Embeddings are ready.',
      embeddingsUnavailable: 'Embeddings are unavailable, so EverMemory will fall back to non-semantic recall.',
    },
    general: {
      ready: 'ready',
      degraded: 'degraded',
      disabled: 'disabled',
      labels: {
        yes: 'yes',
        no: 'no',
        unknown: 'unknown',
      },
    },
  },
} as const;

function lookupMessage(locale: 'zh' | 'en', key: string): string | undefined {
  const path = key.split('.');
  let current: unknown = messages[locale];

  for (const segment of path) {
    if (typeof current !== 'object' || current === null || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Resolves a localized message by dotted path and falls back to English.
 */
export function t(key: string, locale: Locale = 'auto'): string {
  const resolvedLocale: 'zh' | 'en' = locale === 'zh' ? 'zh' : 'en';
  return lookupMessage(resolvedLocale, key) ?? lookupMessage('en', key) ?? key;
}
