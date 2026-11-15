// Token Radar's model, version radar-4: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every protocol that records no token and is not a wrapped, staked or bridged product
// of one that trades, and not a versioned pool or an exchange: the watchlist's own definition, applied
// to the whole snapshot instead of only above the floor. The watchlist (40 protocols) is the floor,
// never a ceiling: the board adds every other protocol that meets the same definition, below the floor
// and above it. Live-token protocols are kept apart and shown with the market's own values, never mixed
// into the ranked board. The pre-token protocols the rule leaves out are set aside with the rule that
// left each one out, so the snapshot's whole 758 protocols are accounted for: 198 ranked, 144 set
// aside, 128 live-token comps priced the curve, and the rest record a token but carry no usable
// market cap.
//
// Implied value follows only from the snapshot's own figures. For one protocol:
//
//   curve      = 10^intercept x tvl_usd^slope, the least-squares log-log fit over the snapshot's own
//                live-token comps (market cap against TVL). A flat multiple would call a $2.7B protocol
//                ten times a $270M one; the comps say value grows slower than size (slope below one),
//                so the curve prices big TVL down and small TVL up, as the market itself does.
//   factor     = the category's median ratio of actual market cap to the curve's prediction, when at
//                least MIN_LIVE_N live comps in the category support it; otherwise 1 (the curve alone).
//                Clamped to [factor_floor, factor_cap]: a three-comp median is not allowed to price a
//                row six times the curve.
//   base       = curve x factor
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   breadth    = 1 + 0.02 x min(chains, 5)
//   implied    = max(1, round(base x growthMult x maturity x breadth))
//
// The fit is checked, not asserted: leave-one-out over the live comps (refit the curve and the factor
// without each comp, then predict it) lands within 3x for about two in five comps, median miss about
// x3.5; one flat multiple manages about one in three, median miss about x5.1. The middle half of
// launches land between about 0.29x and 3.54x of the curve, so every row carries that range beside its
// number. A model this wide is a rough anchor, not a price, and the dashboard says so. The curve is
// also tested blind: fitted only on the launches listed before 2024, it predicts the launches listed
// since within 3x for about half of them, median miss about x2.9 — a forward test, not a refit.
//
// Farm economics, per row, from the same figures plus stated assumptions only: the cheapest chain the
// protocol is live on sets the gas, the farm plan sets the capital and the hours, and a 4% T-bill prices
// the capital's time. The page never claims a yield: it asks how much of the implied value must reach
// farmers, shared in proportion to capital, for the farm to pay its fees and the T-bill. FARM when a
// tenth of it suffices, THIN when a quarter does, SKIP when even a quarter does not.
//
// No protocol name is ever special-cased: the same function scores every row. A protocol "records no
// token" when DefiLlama's record carries no market cap, no CoinGecko id and no symbol for it; that
// record is not proof it has none.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  min_live_n: number;
  factor_floor: number;
  factor_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  tbill_rate: number;
  gas_ethereum: number;
  gas_solana: number;
  gas_other: number;
  econ_alloc: number;
  verdict_farm: number;
  verdict_thin: number;
}

export const MODEL: ModelConstants = {
  min_live_n: 5,
  factor_floor: 0.25,
  factor_cap: 4.0,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.02,
  breadth_max_chains: 5,
  tbill_rate: 0.04,
  gas_ethereum: 25,
  gas_solana: 0.05,
  gas_other: 3,
  econ_alloc: 0.1,
  verdict_farm: 0.1,
  verdict_thin: 0.25,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

/** The fitted size curve, its leave-one-out check and its blind forward test, computed from the snapshot's live comps. */
export interface SizeFit {
  intercept: number;
  slope: number;
  r2: number;
  n_comps: number;
  loo_within3x: number;
  loo_median_miss: number;
  loo_p25: number;
  loo_p75: number;
  flat_within3x: number;
  flat_median_miss: number;
  /** The blind test: the curve fitted only on comps listed before `cut`, predicting those listed since. */
  blind: { cut: string; n_train: number; n_test: number; within3x: number; median_miss: number };
}

/** One category's factor, as the dashboard's model table shows it. */
export interface CategoryFactor {
  category: string;
  factor: number;
  source: 'category' | 'curve';
  live_n: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base: number;
    factor: number;
    factor_source: 'category' | 'curve';
    live_n: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  base: number;
  factor: number;
  factor_source: 'category' | 'curve';
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A pre-token protocol the ranking rule leaves out, with the rule that left it out. */
export interface ExcludedRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  reason: string;
}

/** The snapshot's audit: every protocol accounted for, so the dashboard can say so. */
export interface SnapshotAudit {
  total: number;
  /** Live-token protocols whose market cap is 0 or negative: a token, but no usable price. */
  bad_mcap: number;
  /** Protocols that record a token (a CoinGecko id or a symbol) but carry no market cap. */
  no_mcap: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  excluded_size: number;
  audit: SnapshotAudit;
  fit: SizeFit;
  factors: CategoryFactor[];
  comps: [number, number][];
  rows: RadarRow[];
  live: LiveRow[];
  excluded: ExcludedRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted list of numbers; null when the list is empty. */
function medianOf(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The snapshot's live-token comps: protocols whose token trades, with a usable market cap and TVL. */
export function liveComps(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => {
    if (p.mcap_usd === null || p.tvl_usd <= 0) return false;
    const ratio = p.mcap_usd / p.tvl_usd;
    return Number.isFinite(ratio) && ratio > 0;
  });
}

/** Least squares on log10(market cap) against log10(TVL): the size curve's own constants. */
function olsFit(points: SnapshotProtocol[]): { intercept: number; slope: number; r2: number } {
  const n = points.length;
  const xs = points.map((p) => Math.log10(p.tvl_usd));
  const ys = points.map((p) => Math.log10(p.mcap_usd!));
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    syy += (ys[i]! - my) * (ys[i]! - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { intercept, slope, r2 };
}

/** One category's factor from a set of comps against a fit: the median of actual over predicted. */
function factorTable(
  points: SnapshotProtocol[],
  fit: { intercept: number; slope: number },
  model: ModelConstants,
): Map<string, CategoryFactor> {
  const byCategory = new Map<string, number[]>();
  for (const p of points) {
    const pred = Math.pow(10, fit.intercept + fit.slope * Math.log10(p.tvl_usd));
    const ratio = p.mcap_usd! / pred;
    const key = p.category ?? 'Other';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  const out = new Map<string, CategoryFactor>();
  for (const [category, ratios] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    ratios.sort((a, b) => a - b);
    const med = medianOf(ratios);
    if (med !== null && ratios.length >= model.min_live_n) {
      out.set(category, {
        category,
        factor: Math.min(model.factor_cap, Math.max(model.factor_floor, med)),
        source: 'category',
        live_n: ratios.length,
      });
    } else {
      out.set(category, { category, factor: 1, source: 'curve', live_n: ratios.length });
    }
  }
  return out;
}

/** The quartile of a sorted list, by nearest rank. */
function quartile(sorted: number[], q: number): number {
  const at = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[at]!;
}

/**
 * The fitted size curve and its leave-one-out check, computed from the snapshot's live-token comps
 * at run time. The curve is the least-squares log-log fit of market cap on TVL; each category with at
 * least MIN_LIVE_N comps gets its own factor (the median of actual over the curve's prediction,
 * clamped), every other category rides the curve alone. Leave-one-out refits the curve and the factor
 * without each comp and predicts it, and does the same for one flat multiple, so the page can print
 * both models' accuracy side by side instead of asserting it. The blind test fits the curve only on
 * the comps listed before 2024 and predicts the ones listed since, with the curve alone.
 */
export function computeFit(
  protocols: SnapshotProtocol[],
  model: ModelConstants = MODEL,
): { fit: SizeFit; factors: Map<string, CategoryFactor>; comps: [number, number][] } {
  const comps = liveComps(protocols);
  const fit0 = olsFit(comps);
  const factors = factorTable(comps, fit0, model);
  const ratiosByComp = comps.map((p) => p.mcap_usd! / p.tvl_usd);
  const flatMedian = medianOf([...ratiosByComp].sort((a, b) => a - b)) ?? 0.2;
  const loo: number[] = [];
  const flatLoo: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const sub = comps.filter((_, j) => j !== i);
    const f = olsFit(sub);
    const held = comps[i]!;
    const table = factorTable(sub, f, model);
    const entry = table.get(held.category ?? 'Other');
    const factor = entry === undefined ? 1 : entry.factor;
    const pred = Math.pow(10, f.intercept + f.slope * Math.log10(held.tvl_usd)) * factor;
    loo.push(held.mcap_usd! / pred);
    const flatSub = ratiosByComp.filter((_, j) => j !== i).sort((a, b) => a - b);
    const flatMed = medianOf(flatSub) ?? flatMedian;
    flatLoo.push(held.mcap_usd! / (flatMed * held.tvl_usd));
  }
  const looSorted = [...loo].sort((a, b) => a - b);
  const miss = (r: number): number => Math.max(r, 1 / r);
  // The blind test: fit the curve only on the comps listed before the cut, then predict the comps
  // listed since, with the curve alone. Nothing in the test set was used to fit it, so this is a
  // forward test, not a refit: the one number on the page no leave-one-out check can give. The
  // category factors are left out here on purpose — fitted on the pre-cut comps alone they are thin
  // (a median over a handful of launches) and they score worse forward than the curve alone.
  const BLIND_CUT = '2024-01-01';
  const blindTrain = comps.filter((p) => p.listed_at !== null && p.listed_at < BLIND_CUT);
  const blindTest = comps.filter((p) => p.listed_at !== null && p.listed_at >= BLIND_CUT);
  const blindFit = olsFit(blindTrain);
  const blindRatios = blindTest.map(
    (p) => p.mcap_usd! / Math.pow(10, blindFit.intercept + blindFit.slope * Math.log10(p.tvl_usd)),
  );
  const blind = {
    cut: BLIND_CUT,
    n_train: blindTrain.length,
    n_test: blindTest.length,
    within3x: blindRatios.filter((r) => r >= 1 / 3 && r <= 3).length / blindRatios.length,
    median_miss: medianOf(blindRatios.map(miss).sort((a, b) => a - b)) ?? 0,
  };
  const fit: SizeFit = {
    intercept: fit0.intercept,
    slope: fit0.slope,
    r2: fit0.r2,
    n_comps: comps.length,
    loo_within3x: loo.filter((r) => r >= 1 / 3 && r <= 3).length / loo.length,
    loo_median_miss: medianOf(loo.map(miss).sort((a, b) => a - b)) ?? 0,
    loo_p25: quartile(looSorted, 0.25),
    loo_p75: quartile(looSorted, 0.75),
    flat_within3x: flatLoo.filter((r) => r >= 1 / 3 && r <= 3).length / flatLoo.length,
    flat_median_miss: medianOf(flatLoo.map(miss).sort((a, b) => a - b)) ?? 0,
    blind,
  };
  return {
    fit,
    factors,
    comps: comps.map((p): [number, number] => [p.tvl_usd, p.mcap_usd!]),
  };
}

/** The factor one category gets: its own median residual when trusted, else the curve alone. */
export function factorFor(
  category: string | null,
  factors: Map<string, CategoryFactor>,
): CategoryFactor {
  const key = category ?? 'Other';
  const found = factors.get(key);
  if (found !== undefined) return found;
  return { category: key, factor: 1, source: 'curve', live_n: 0 };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fitted: { fit: SizeFit; factors: Map<string, CategoryFactor> },
  model: ModelConstants = MODEL,
): {
  implied: number;
  base: number;
  factor: number;
  factorSource: 'category' | 'curve';
  liveN: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const entry = factorFor(protocol.category, fitted.factors);
  const curve = Math.pow(10, fitted.fit.intercept + fitted.fit.slope * Math.log10(protocol.tvl_usd));
  const base = curve * entry.factor;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + model.breadth_per_chain * Math.min(protocol.chains.length, model.breadth_max_chains);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return {
    implied,
    base,
    factor: entry.factor,
    factorSource: entry.source,
    liveN: entry.live_n,
    growthPct,
    growthMult,
    maturityMult,
    breadthMult,
    age,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A name carrying a whole word wrapped, staked or staking is a product of a token that trades. */
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;
/** A name beginning with an exchange's name is that exchange's product, per the watchlist's rule. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
/** Categories the watchlist's rule leaves out: wrapped, staked and bridged products, and exchanges. */
const EXCLUDED_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: it records no token, and it is not a wrapped, staked
 * or bridged product of one that trades, not a versioned pool, and not an exchange. This is the
 * watchlist's own definition, applied to the whole snapshot: the floor is a size line, and the rest of
 * the definition is what makes a protocol a launch candidate at all.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_OR_STAKED.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  fitted: { fit: SizeFit; factors: Map<string, CategoryFactor> },
  model: ModelConstants = MODEL,
): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, whether or not it passes the board's own rule.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other protocol that meets the launch-candidate definition, whatever its
  // size. A chosen protocol stays chosen; nothing here replaces a watchlist row.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fitted, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: snapshot.watchlist.includes(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      // The curve base is carried at full precision: the dashboard recomputes this row from it, and a
      // rounded base would make the recomputation miss board.json's number by a few dollars.
      base: s.base,
      factor: s.factor,
      factor_source: s.factorSource,
      live_n: s.liveN,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The cheapest chain a protocol is live on, by the gas table the economics uses: farm where it is cheap. */
export function chainOf(p: SnapshotProtocol): string {
  if (p.chains.length === 0) return 'its main chain';
  let best = p.chains[0]!;
  for (const c of p.chains) {
    if (gasCostFor(c, MODEL) < gasCostFor(best, MODEL)) best = c;
  }
  return best;
}

/** One transaction's gas in dollars, by chain: the economics' stated assumption. */
export function gasCostFor(chain: string, model: ModelConstants = MODEL): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return model.gas_ethereum;
  if (c === 'solana') return model.gas_solana;
  return model.gas_other;
}

/** The first chain a protocol names that is not its cheapest one, for the farm plan's mention. */
function otherChain(p: SnapshotProtocol, chain: string): string | null {
  for (const c of p.chains) {
    if (c !== chain) return c;
  }
  return null;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction costs on the protocol's main chain, in the words a farmer can budget by. */
function gasNoteFor(chain: string): { text: string; cost: string } {
  const c = chain.toLowerCase();
  if (c === 'ethereum') {
    return {
      text: `On Ethereum mainnet, budget $10 to $40 of gas for the first transaction and do it when gas is low.`,
      cost: '$10 to $40 of gas on Ethereum',
    };
  }
  if (c === 'solana') {
    return { text: `On Solana the transaction costs under $0.05, so gas is never the reason to wait.`, cost: 'under $0.05 of gas on Solana' };
  }
  return {
    text: `On ${chain}, gas is a few dollars at most, so the position's capital matters more than the fee.`,
    cost: 'a few dollars of gas at most',
  };
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('yield') && !c.includes('aggregator')) return `Deposit $${capital} into ${name}'s yield position on ${chain} and keep it earning.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('governance')) return `Deposit $${capital} and vote in ${name}'s governance on ${chain}.`;
  if (c.includes('payment')) return `Send $${capital} through ${name}'s payment rail on ${chain} and keep the receipt.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly action: what staying active looks like for this kind of protocol. */
function weeklyFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply or borrow a small amount again on ${chain} so the wallet stays active.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Swap or add a little liquidity again on ${chain} so the wallet stays active.`;
  if (c.includes('yield') && !c.includes('aggregator')) return `Top the position up, or claim and re-deposit, so the wallet stays active.`;
  if (c.includes('bridge')) return `Bridge a small amount again on ${chain} so the wallet stays active on the route.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the rewards so the position keeps compounding.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Open or close one small hedge so the wallet stays active.`;
  if (c.includes('prediction')) return `Place one more small market position so the wallet stays active.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Deposit into another vault, or top up the first one, so the wallet stays active.`;
  if (c.includes('stable')) return `Mint or deposit a little more of the stable asset so the wallet stays active.`;
  if (c.includes('rwa')) return `Mint a little more of the yield asset and hold it.`;
  if (c.includes('insurance')) return `Renew or top up the cover so the wallet stays active.`;
  if (c.includes('governance')) return `Vote in the next proposal so the wallet stays active.`;
  if (c.includes('payment')) return `Send another small payment through the rail so the wallet stays active.`;
  return `Repeat the deposit, or make one swap, so the wallet stays active.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain) + (otherChain(p, chain) !== null ? ` It is also live on ${otherChain(p, chain)}.` : '');
  const gas = gasNoteFor(chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: gas.text,
      cost: gas.cost,
      time: '5 minutes to check',
    },
    {
      text: weeklyFor(p, chain),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, then unwind gradually instead of all at once.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The rule that leaves a pre-token protocol out of the ranking, or null when it is rankable. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return null;
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return `Category: ${p.category}`;
  if (VERSIONED.test(p.name)) return 'Versioned pool';
  if (WRAPPED_OR_STAKED.test(p.name)) return 'Wrapped / staked product';
  if (EXCHANGE_PREFIX.test(p.name)) return 'Exchange product';
  return null;
}

/** The pre-token protocols the ranking leaves out, by TVL, each with the rule that left it out. */
export function excludedRows(snapshot: Snapshot, boardSlugs: Set<string>): ExcludedRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && !boardSlugs.has(p.slug))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      reason: exclusionReason(p) ?? 'Left out by the ranking rule',
    }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** The live-token comps, by market cap: the exact set the size curve is fitted from. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return liveComps(snapshot.protocols)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The snapshot's audit: how many protocols fall outside the board, the live set and the set-aside. */
export function auditSnapshot(snapshot: Snapshot): SnapshotAudit {
  const live = snapshot.protocols.filter((p) => !isPreToken(p));
  return {
    total: snapshot.protocols.length,
    bad_mcap: live.filter((p) => p.mcap_usd !== null && !(p.tvl_usd > 0 && p.mcap_usd / p.tvl_usd > 0)).length,
    no_mcap: live.filter((p) => p.mcap_usd === null).length,
  };
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    watchlist: row.watchlist,
    base: row.model.base,
    factor: row.model.factor,
    factor_source: row.model.factor_source,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fitted = computeFit(snapshot.protocols, model);
  const board = buildBoard(snapshot, fitted, model);
  const live = liveRows(snapshot);
  const excluded = excludedRows(snapshot, new Set(board.map((r) => r.slug)));
  const audit = auditSnapshot(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    // A plain label, not the snapshot's raw source line: that line carries the fetch URL,
    // and no URL belongs in the dashboard's data (the rule bans network references anywhere).
    source: 'DefiLlama protocol index',
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    excluded_size: excluded.length,
    audit,
    fit: fitted.fit,
    factors: [...fitted.factors.values()].sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0)),
    comps: fitted.comps,
    rows: board.map(radarRow),
    live,
    excluded,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
