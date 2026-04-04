import { randomUUID } from 'node:crypto';
import type { ClockPort } from '../ports/clock.js';
import type { HostPort } from '../ports/host.js';
import type { ButlerLogger } from '../types.js';
import type { KnowledgeGapDetector } from './gapDetector.js';
import type { KnowledgeGap, PlannedQuestion, QuestionConfig, QuestionOutcome } from './types.js';

const DEFAULT_CONFIG: QuestionConfig = {
  maxPerSession: 2,
  maxPerDay: 5,
  cooldownMinutes: 30,
};

export class QuestionPlanner {
  private sessionQuestionCount = 0;
  private dailyQuestionCount = 0;
  private lastQuestionAt = 0;
  private lastResetDate = '';

  constructor(
    private readonly gapDetector: KnowledgeGapDetector,
    private readonly host: HostPort,
    private readonly clock: ClockPort,
    private readonly logger?: ButlerLogger,
    private readonly config: QuestionConfig = DEFAULT_CONFIG,
  ) {}

  planQuestion(gap: KnowledgeGap): PlannedQuestion | null {
    this.resetDailyIfNeeded();
    if (this.sessionQuestionCount >= this.config.maxPerSession) {
      return null;
    }
    if (this.dailyQuestionCount >= this.config.maxPerDay) {
      return null;
    }
    if (this.clock.now() - this.lastQuestionAt < this.config.cooldownMinutes * 60 * 1000) {
      return null;
    }
    if (!gap.suggestedQuestion) {
      return null;
    }
    return {
      id: randomUUID(),
      gapType: gap.type,
      questionText: gap.suggestedQuestion,
      context: gap.description,
      importance: gap.importance,
      createdAt: this.clock.isoNow(),
    };
  }

  async askQuestion(question: PlannedQuestion): Promise<QuestionOutcome> {
    if (!this.host.askUser) {
      return { questionId: question.id, status: 'expired' };
    }
    try {
      const answer = await this.host.askUser(question.questionText, { context: question.context });
      this.recordQuestionAsked();
      if (answer === null) {
        return { questionId: question.id, status: 'dismissed' };
      }
      return {
        questionId: question.id,
        status: 'answered',
        answerText: answer,
        answeredAt: this.clock.isoNow(),
      };
    } catch (error) {
      this.logger?.error('QuestionPlanner failed to ask question', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { questionId: question.id, status: 'expired' };
    }
  }

  resetSession(): void {
    this.sessionQuestionCount = 0;
  }

  getSessionQuestionCount(): number {
    return this.sessionQuestionCount;
  }

  getDailyQuestionCount(): number {
    return this.dailyQuestionCount;
  }

  private recordQuestionAsked(): void {
    this.sessionQuestionCount += 1;
    this.dailyQuestionCount += 1;
    this.lastQuestionAt = this.clock.now();
  }

  private resetDailyIfNeeded(): void {
    const today = this.clock.isoNow().slice(0, 10);
    if (today === this.lastResetDate) {
      return;
    }
    this.dailyQuestionCount = 0;
    this.lastResetDate = today;
  }
}
