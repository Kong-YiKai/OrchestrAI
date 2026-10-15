import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Model } from 'mongoose';

type Row = { messageId: string; parentMessageId?: string | null; isCreatedByUser?: boolean };

const NO_PARENT = '00000000-0000-0000-0000-000000000000';
const ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Removes one user turn: the user's message and every reply to it. Later turns are
 * re-parented onto the removed turn's parent, so the exchange leaves the context chain
 * that the next request is built from instead of cutting the chain. Chat stays the only
 * owner of messages; only rows of the signed-in user are read or written.
 */
export function createOrchestraTurnRouter(getMessageModel: () => Model<Row>): Router {
  const router = Router();
  router.delete('/:conversationId/:messageId', async (req: Request, res: Response) => {
    const user = (req.user as { id?: string } | undefined)?.id;
    if (!user) {
      res.status(401).json({ error: 'authentication_required' });
      return;
    }
    const { conversationId, messageId } = req.params;
    if (!ID.test(conversationId) || !ID.test(messageId)) {
      res.status(400).json({ error: 'invalid_turn' });
      return;
    }
    try {
      const Message = getMessageModel();
      const rows = await Message.find({ conversationId, user })
        .select('messageId parentMessageId isCreatedByUser')
        .lean<Row[]>();
      const turn = rows.find((row) => row.messageId === messageId);
      if (!turn?.isCreatedByUser) {
        res.status(404).json({ error: 'turn_not_found' });
        return;
      }
      const replies = new Set(
        rows.filter((row) => row.parentMessageId === messageId).map((row) => row.messageId),
      );
      const removed = [messageId, ...replies];
      const reparented = rows
        .filter((row) => row.parentMessageId != null && replies.has(row.parentMessageId))
        .map((row) => row.messageId);
      const parentMessageId = turn.parentMessageId ?? NO_PARENT;
      // Re-parent first: a failure after this step leaves an unreachable pair, never a cut chain.
      if (reparented.length) {
        await Message.updateMany(
          { conversationId, user, messageId: { $in: reparented } },
          { $set: { parentMessageId } },
        );
      }
      await Message.deleteMany({ conversationId, user, messageId: { $in: removed } });
      res.set('Cache-Control', 'no-store').json({ removed, reparented, parentMessageId });
    } catch {
      res.status(503).json({ error: 'turn_delete_failed' });
    }
  });
  return router;
}
