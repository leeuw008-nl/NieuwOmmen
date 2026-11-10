import { getPendingDeliverySubscriptions, areDeliveriesComplete } from "./push-selection.js";

/**
 * Per-article delivery orchestration used by the scheduled Worker.
 * Persist successful endpoint IDs after every batch so later cron runs retry
 * only endpoints that have not accepted the push yet.
 */
export async function processArticleDeliveries({
  article, subscriptions, env, shouldSendToSub, sendPush,
  delivered = new Set(), capacity = 35, saveDelivered,
  batchSize = 20, pause = async () => {}
}) {
  const eligible = [];
  for (const sub of subscriptions || []) {
    if (await shouldSendToSub(sub, article, env)) eligible.push(sub);
  }
  const pending = getPendingDeliverySubscriptions(eligible, delivered);
  const attempts = Math.min(pending.length, Math.max(0, capacity));
  let accepted = 0;
  let failed = 0;
  for (let offset = 0; offset < attempts; offset += batchSize) {
    const batch = pending.slice(offset, Math.min(offset + batchSize, attempts));
    const results = await Promise.all(batch.map(sub => sendPush(sub, article, env)));
    for (let i = 0; i < results.length; i++) {
      if (results[i] && results[i].ok) {
        delivered.add(batch[i]._id);
        accepted++;
      } else {
        failed++;
      }
    }
    if (saveDelivered) await saveDelivered(article.link, delivered);
    if (offset + batchSize < attempts) await pause();
  }
  return {
    eligible: eligible.length,
    pendingBefore: pending.length,
    attempts,
    accepted,
    failed,
    remaining: getPendingDeliverySubscriptions(eligible, delivered).length,
    complete: areDeliveriesComplete(eligible, delivered),
    delivered
  };
}
