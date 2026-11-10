/* Puree simulatie van aflevering per artikel + abonnement.
 * Alleen voor tests: geen Cloudflare-binding, KV, netwerk of pushverzending.
 * Dit model bewijst de gewenste toestandslogica, niet de atomische garanties
 * van een toekomstige opslagimplementatie.
 */
export function canonicalArticleKey(link) {
  try {
    const url = new URL(String(link || "").trim());
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw new Error("Ongeldige artikel-URL");
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    throw new TypeError("Geen geldige canonieke artikel-URL", { cause: error });
  }
}

export class DeliveryLedgerSimulation {
  constructor() {
    this.states = new Map();
  }

  deliveryKey(article, subscriptionId) {
    if (!subscriptionId || !String(subscriptionId).trim()) {
      throw new TypeError("subscriptionId ontbreekt");
    }
    return canonicalArticleKey(article?.link) + "::" + String(subscriptionId);
  }

  claim(article, subscriptionId) {
    const key = this.deliveryKey(article, subscriptionId);
    const current = this.states.get(key);
    if (current?.status === "reserved" || current?.status === "sent") {
      return { claimed: false, key, status: current.status };
    }
    this.states.set(key, { status: "reserved", attempts: (current?.attempts || 0) + 1 });
    return { claimed: true, key, status: "reserved" };
  }

  markSent(key) {
    const current = this.states.get(key);
    if (!current || current.status !== "reserved") {
      throw new Error("Alleen een gereserveerde aflevering kan op verzonden worden gezet");
    }
    this.states.set(key, { ...current, status: "sent" });
  }

  markFailed(key, reason = "onbekend") {
    const current = this.states.get(key);
    if (!current || current.status !== "reserved") {
      throw new Error("Alleen een gereserveerde aflevering kan op mislukt worden gezet");
    }
    this.states.set(key, { ...current, status: "failed", reason: String(reason) });
  }

  get(article, subscriptionId) {
    const state = this.states.get(this.deliveryKey(article, subscriptionId));
    return state ? { ...state } : null;
  }

  snapshot() {
    return [...this.states.entries()].map(([key, state]) => ({ key, ...state }));
  }
}
