import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TMessage } from 'librechat-data-provider';
import { parseAskUserQuestionArgs, parseAskUserQuestionsArgs } from '~/utils/approval';
import { useAuthContext } from '~/hooks';
import { useTeamApi } from './teams/api';
import type { Project } from './teams/api';

/** Must match CLARIFY_CONFIRM_ID in the server's orchestra/workflow.ts instructions. */
export const CONFIRM_ID = 'orchestra_confirm';

export type ClarifiedAnswer = {
  key: string;
  question: string;
  header?: string;
  answer?: string;
  at: string;
};
export type Clarification = {
  answers: ClarifiedAnswer[];
  /** Questions shown to the user that have no answer yet. */
  pending: number;
  /** The latest confirmed requirements summary; the team is created from it. */
  confirmed?: { id: string; name?: string; summary: string; budget?: number; at: string };
};

type ToolPart = { type?: string; tool_call?: { id?: string; name?: string; args?: unknown; output?: string } };

/** Labels instead of option values where the model offered them. */
function label(options: { label: string; value: string }[] | undefined, value: string) {
  return value
    .split(', ')
    .map((v) => options?.find((o) => o.value === v)?.label ?? v)
    .join('、');
}

/**
 * Reads the requirement clarification out of a conversation: every ask_user_question card the
 * assistant showed, what the user picked, and the summary they confirmed. The conversation stays
 * the record; nothing here is stored separately.
 */
export function readClarification(messages: TMessage[] | null | undefined): Clarification {
  const result: Clarification = { answers: [], pending: 0 };
  let budget: number | undefined;
  for (const message of messages ?? []) {
    for (const part of (message.content ?? []) as ToolPart[]) {
      const call = part?.type === 'tool_call' ? part.tool_call : undefined;
      if (!call || call.name !== 'ask_user_question') continue;
      const args = call.args as string | Record<string, unknown> | undefined;
      const at = message.createdAt ?? new Date().toISOString();
      const id = call.id ?? `${message.messageId}-${result.answers.length}`;
      const output = call.output ?? '';
      const batch = parseAskUserQuestionsArgs(args);
      const items = batch?.questions ?? [];
      if (!batch) {
        const single = parseAskUserQuestionArgs(args);
        if (!single) continue;
        if (!output) result.pending += 1;
        result.answers.push({ key: id, question: single.question, answer: output ? label(single.options, output) : undefined, at });
        continue;
      }
      let answers: Record<string, string> = {};
      try {
        answers = (JSON.parse(output) as { answers?: Record<string, string> }).answers ?? {};
      } catch {
        /* Not answered yet. */
      }
      for (const item of items) {
        const value = answers[item.id];
        if (value === undefined) result.pending += 1;
        if (item.id === 'budget' && value) {
          const amount = Number(/(\d+(?:\.\d+)?)/.exec(value)?.[1]);
          if (amount > 0) budget = Math.min(amount, 10000);
        }
        if (item.id === CONFIRM_ID) {
          if (value === 'confirm') {
            result.confirmed = { id, name: item.header?.trim(), summary: item.description?.trim() || item.question, budget, at };
          }
          continue;
        }
        result.answers.push({ key: `${id}-${item.id}`, question: item.question, header: item.header,
          answer: value === undefined ? undefined : label(item.options, value), at });
      }
    }
  }
  return result;
}

const FOLDER = /[\\/:*?"<>|\u0000-\u001f]/g;

/**
 * Once the user confirms the clarified requirements, the agent team is created from them and
 * linked to this conversation. The confirmation's tool call id is the idempotency key, so a
 * reload or a second tab never creates a second team.
 */
export function useClarifiedTeam(
  conversationId: string | undefined,
  messages: TMessage[] | null | undefined,
  onCreated?: (name: string) => void,
) {
  const call = useTeamApi();
  const client = useQueryClient();
  const { user } = useAuthContext();
  const sent = useRef(new Set<string>());
  const [failed, setFailed] = useState('');
  const [attempt, setAttempt] = useState(0);
  const clarification = useMemo(() => readClarification(messages), [messages]);
  const { confirmed, answers } = clarification;
  const saved = !!conversationId && conversationId !== 'new';
  useEffect(() => {
    if (!saved || !confirmed || !conversationId || sent.current.has(confirmed.id)) return;
    const known = client.getQueryData<{ projects: Project[] }>(['orchestra-teams', user?.id]);
    if (known?.projects.some((p) => p.conversation_id === conversationId && p.created_at >= confirmed.at)) return;
    sent.current.add(confirmed.id);
    setFailed('');
    const decided = answers.filter((a) => a.answer).map((a) => `- ${a.header ?? a.question}：${a.answer}`);
    const goal = [confirmed.summary, decided.length ? `\n\n已澄清的选择：\n${decided.join('\n')}` : '']
      .join('').slice(0, 4000);
    const name = (confirmed.name || confirmed.summary.split('\n')[0])
      .replace(/^目标[:：]\s*/, '').replace(FOLDER, '').replace(/[。.，,！!？?\s]+$/, '').trim().slice(0, 40) || '新项目';
    const key = `clarify-${confirmed.id}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
    call<Project>('/projects', 'POST', { goal, workspace_name: name, budget_cny: confirmed.budget ?? 5,
      conversation_id: conversationId }, key)
      .then(() => {
        onCreated?.(name);
        return client.invalidateQueries(['orchestra-teams', user?.id]);
      })
      .catch((error: Error) => setFailed(error.message || '组建团队失败，请重试。'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCreated is a fresh closure each render
  }, [saved, confirmed, conversationId, answers, call, client, user?.id, attempt]);
  const retry = () => {
    if (confirmed) sent.current.delete(confirmed.id);
    setAttempt((n) => n + 1);
  };
  return { clarification, failed, retry };
}
