import type { Request } from 'express';
import { requestResearch } from './research';
import { workflowRequest } from './workflow';

type Identity = { id: string; tenantId?: string };

/**
 * Removes a guest's records from the services chat delegates to (agent teams and research).
 * Running work is stopped first; anything still busy is left for the next sweep, so the
 * guest account itself is only deleted once nothing it owns remains elsewhere.
 */
export async function purgeOrchestraServices(user: Identity): Promise<boolean> {
  let clean = true;
  if (process.env.WORKFLOW_API_URL) {
    const listed = await workflowRequest(user, 'GET', '/projects');
    if (listed.status !== 200) return false;
    const projects = (JSON.parse(listed.text) as { projects?: { id: string }[] }).projects ?? [];
    for (const project of projects) {
      await workflowRequest(user, 'POST', `/projects/${project.id}/control`, { body: { action: 'pause' } });
      const removed = await workflowRequest(user, 'DELETE', `/projects/${project.id}`);
      if (removed.status !== 200 && removed.status !== 404) clean = false;
    }
  }
  if (process.env.RESEARCH_API_URL) {
    const req = { user } as unknown as Request;
    try {
      // The listing is paged at ten; each pass removes what it shows.
      for (let pass = 0; pass < 20; pass++) {
        const { queries = [] } = (await requestResearch(req, 'GET', '/queries')) as { queries?: { id: string; status: string }[] };
        if (!queries.length) break;
        for (const query of queries) {
          if (query.status === 'queued' || query.status === 'running') {
            await requestResearch(req, 'POST', `/queries/${query.id}/cancel`, {});
          }
          await requestResearch(req, 'DELETE', `/queries/${query.id}`);
        }
      }
    } catch {
      clean = false;
    }
  }
  return clean;
}
