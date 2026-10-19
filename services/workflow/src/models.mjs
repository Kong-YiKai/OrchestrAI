import { log } from './config.mjs';

// Used when the gateway cannot be asked: the default model at the gateway's conservative price.
const FALLBACK = [{ id: 'deepseek-flash', label: 'DeepSeek V4.1 Flash', vendor: 'DeepSeek', category: 'text',
  price: { input: 2.4, output: 9.6 }, available: true }];

/**
 * The model catalog lives in the gateway (services/gateway/models.json): labels, CNY prices
 * and which providers have a key. Read it at most once a minute; tests pass `settings.catalog`.
 */
export function createCatalog(settings, fetcher = fetch) {
  const fallbackModel = settings.gateway?.model ?? 'deepseek-flash';
  let cached, at = 0;
  async function list() {
    if (settings.catalog) return settings.catalog;
    if (cached && Date.now() - at < 60_000) return cached;
    if (!settings.gateway) return FALLBACK;
    try {
      const response = await fetcher(`${settings.gateway.url.replace(/\/v1\/?$/, '')}/orchestrai/models`,
        { headers: { authorization: `Bearer ${settings.gateway.key}` }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`catalog ${response.status}`);
      cached = (await response.json()).models;
      at = Date.now();
      return cached;
    } catch {
      log('catalog_unavailable');
      return cached ?? FALLBACK;
    }
  }
  const defaultModel = settings.defaultModel ?? fallbackModel;
  /** CNY per million tokens for a node's model; unknown models are billed like the default. */
  const priceOf = (models, id) => (models.find(m => m.id === (id ?? defaultModel)) ?? models.find(m => m.id === defaultModel) ?? FALLBACK[0]).price;
  return { list, priceOf, defaultModel };
}
