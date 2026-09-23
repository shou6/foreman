import type { PermissionRequest } from './events';

export interface QuestionOption {
  label: string;
  description: string;
}

export interface Question {
  question: string;
  header: string;
  multiSelect: boolean;
  options: QuestionOption[];
}

export interface Answer {
  question: string;
  selected: string[];
}

/** Claude からの質問（AskUserQuestion ツール）の入力を、画面用の形に取り出す。形が合わなければ undefined */
export function questionsOf(request: PermissionRequest): Question[] | undefined {
  if (request.toolName !== 'AskUserQuestion' || !Array.isArray(request.input.questions)) {
    return undefined;
  }
  const questions: Question[] = [];
  for (const raw of request.input.questions) {
    const q = asRecord(raw);
    if (typeof q.question !== 'string' || !Array.isArray(q.options)) {
      return undefined;
    }
    questions.push({
      question: q.question,
      header: typeof q.header === 'string' ? q.header : '',
      multiSelect: q.multiSelect === true,
      options: q.options.map((o) => {
        const option = asRecord(o);
        return {
          label: typeof option.label === 'string' ? option.label : '',
          description: typeof option.description === 'string' ? option.description : '',
        };
      }),
    });
  }
  return questions;
}

/** 答えを SDK が受け取る形（question をキーにした answers）にして、元の入力へ足す */
export function answersToInput(
  input: Record<string, unknown>,
  answers: readonly Answer[]
): Record<string, unknown> {
  const merged: Record<string, string> = {};
  for (const answer of answers) {
    merged[answer.question] = answer.selected.join(', ');
  }
  return { ...input, answers: merged };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
