import type { MemoryService } from '../memory/service.js';
import type { SmartnessMetricsService } from '../analytics/smartnessMetrics.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { ProfileRepository } from '../../storage/profileRepo.js';
import type { MemoryStoreInput, ProjectedProfile } from '../../types.js';

export interface OnboardingQuestion {
  readonly id: string;
  readonly category: 'work_style' | 'tech_stack' | 'communication' | 'preferences';
  readonly question: string;
  readonly placeholder?: string;
}

export interface OnboardingResponse {
  readonly questionId: string;
  readonly answer: string;
}

export interface OnboardingResult {
  readonly completed: boolean;
  readonly profileUpdated: boolean;
  readonly memoriesCreated: number;
}

export const ONBOARDING_COMPLETED_HINT = 'system:onboarding_completed';
const MAX_ONBOARDING_ANSWER_LENGTH = 500;

const ONBOARDING_QUESTIONS: readonly OnboardingQuestion[] = [
  {
    id: 'work_style',
    category: 'work_style',
    question: '您偏好的工作方式是什么？（例如：逐步确认、直接执行、详细规划等）',
    placeholder: '例如：关键步骤先确认，其他部分可直接推进',
  },
  {
    id: 'tech_stack',
    category: 'tech_stack',
    question: '您主要使用哪些编程语言和框架？',
    placeholder: '例如：TypeScript、Node.js、React、PostgreSQL',
  },
  {
    id: 'communication_style',
    category: 'communication',
    question: '您偏好的沟通风格是什么？（简洁直接 / 详细解释 / 结构化输出）',
    placeholder: '例如：简洁直接，先结论后细节',
  },
  {
    id: 'always_remember',
    category: 'preferences',
    question: '有哪些事情是您希望 AI 助手始终记住的？',
    placeholder: '例如：默认中文、优先给出 next steps',
  },
  {
    id: 'never_do',
    category: 'preferences',
    question: '有哪些事情是您不希望 AI 助手做的？',
    placeholder: '例如：不要跳过确认直接执行高风险操作',
  },
  {
    id: 'primary_domain',
    category: 'work_style',
    question: '您的主要工作项目或领域是什么？',
    placeholder: '例如：AI 工具链、SaaS 平台、前端基础设施',
  },
] as const;

function buildMemoryInput(
  userId: string,
  question: OnboardingQuestion,
  answer: string,
): MemoryStoreInput {
  const base = {
    scope: { userId },
    source: { kind: 'tool' as const, actor: 'user' as const },
    tags: [] as string[],
    relatedEntities: [question.id],
  };

  switch (question.id) {
    case 'work_style':
      return {
        ...base,
        content: `${question.question} 用户回答：${answer}`,
        type: 'preference',
        tags: ['work_style', 'onboarding'],
      };
    case 'tech_stack':
      return {
        ...base,
        content: `${question.question} 用户回答：${answer}`,
        type: 'fact',
        tags: ['tech_stack', 'onboarding'],
      };
    case 'communication_style':
      return {
        ...base,
        content: answer,
        type: 'preference',
        tags: ['communication_style', 'onboarding'],
      };
    case 'always_remember':
      return {
        ...base,
        content: answer,
        type: 'preference',
        tags: ['default_preference', 'onboarding'],
      };
    case 'never_do':
      return {
        ...base,
        content: answer,
        type: 'constraint',
        tags: ['avoid', 'onboarding'],
      };
    case 'primary_domain':
      return {
        ...base,
        content: answer,
        type: 'project',
        tags: ['primary_domain', 'onboarding'],
      };
    default:
      return {
        ...base,
        content: `${question.question} 用户回答：${answer}`,
        type: 'fact',
      };
  }
}

function appendOnboardingHint(profile: ProjectedProfile): ProjectedProfile {
  if (profile.behaviorHints.includes(ONBOARDING_COMPLETED_HINT)) {
    return profile;
  }
  return {
    ...profile,
    behaviorHints: [...profile.behaviorHints, ONBOARDING_COMPLETED_HINT],
  };
}

export class OnboardingService {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly memoryRepo: MemoryRepository,
    private readonly profileRepo: ProfileRepository,
    private readonly smartnessMetricsService?: SmartnessMetricsService,
  ) {}

  isOnboardingNeeded(userId: string): boolean {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      return true;
    }
    const profile = this.profileRepo.getByUserId(normalizedUserId);
    return !profile?.behaviorHints.includes(ONBOARDING_COMPLETED_HINT);
  }

  getQuestions(): readonly OnboardingQuestion[] {
    return ONBOARDING_QUESTIONS;
  }

  generateWelcomeMessage(isFirstRun: boolean, userName?: string, userId?: string): string {
    if (isFirstRun) {
      return [
        '您好！我是 EverMemory，您的 AI 大管家。',
        '我会帮您记住每次对话的重要内容，主动提醒相关经验，随着使用越来越了解您。',
        '让我先了解一下您的工作习惯，这样我能更好地服务您 →',
      ].join('\n');
    }

    const normalizedUserId = userId?.trim();
    const memoryCount = normalizedUserId
      ? this.memoryRepo.count({ scope: { userId: normalizedUserId } })
      : this.memoryRepo.count();
    const displayName = userName?.trim() ? `，${userName.trim()}` : '';
    const smartnessScore = this.resolveSmartnessScore(memoryCount);
    return `欢迎回来${displayName}！我已记住 ${memoryCount} 条您的信息。\n智能度评分：${smartnessScore}/100`;
  }

  async processResponses(
    userId: string,
    responses: readonly OnboardingResponse[],
  ): Promise<OnboardingResult> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      return {
        completed: false,
        profileUpdated: false,
        memoriesCreated: 0,
      };
    }

    const questionsById = new Map(this.getQuestions().map((question) => [question.id, question]));
    let memoriesCreated = 0;

    for (const response of responses) {
      const question = questionsById.get(response.questionId);
      const answer = response.answer.trim();
      if (!question || !answer) {
        continue;
      }
      const clippedAnswer = answer.length > MAX_ONBOARDING_ANSWER_LENGTH
        ? `${answer.slice(0, MAX_ONBOARDING_ANSWER_LENGTH)}...`
        : answer;
      const stored = this.memoryService.store(
        buildMemoryInput(normalizedUserId, question, clippedAnswer),
      );
      if (stored.accepted) {
        memoriesCreated += 1;
      }
    }

    const profile = this.profileRepo.getByUserId(normalizedUserId);
    if (!profile) {
      return {
        completed: false,
        profileUpdated: false,
        memoriesCreated,
      };
    }

    this.profileRepo.upsert(appendOnboardingHint(profile));
    return {
      completed: true,
      profileUpdated: true,
      memoriesCreated,
    };
  }

  private resolveSmartnessScore(memoryCount: number): number {
    if (this.smartnessMetricsService) {
      void this.smartnessMetricsService;
    }
    return Math.max(20, Math.min(100, 20 + Math.round(memoryCount * 1.5)));
  }
}
