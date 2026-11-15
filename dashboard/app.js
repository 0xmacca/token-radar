// Token Radar's dashboard, radar-3. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail view with the model's own inputs,
// the protocol's farm plan and its farm economics, a Method tab that shows the fitted size curve, its
// leave-one-out check and the comps it was fitted from, and a sandbox that re-runs the model with
// different constants. No network: every byte it shows is in data.js. The page recomputes each row
// from the snapshot figures, so the page's code and the board's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var DEFAULTS = { mult: 1, growth: 0.5, maturity: 0.4 };
  var state = {
    q: '', category: 'all', watchlist: false, tab: 'pre-token',
    sort: 'implied', dir: -1, selected: null,
    sandbox: { mult: DEFAULTS.mult, growth: DEFAULTS.growth, maturity: DEFAULTS.maturity },
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n.toFixed(3); }

  // The model in one function: the same arithmetic main.ts runs. With the sandbox at its defaults it
  // reproduces board.json's number exactly; with the sliders moved it re-scores the view only.
  // row.base is the fitted curve's value for this protocol, already times its category factor.
  function impliedOf(row, sb) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * sb.growth;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * sb.maturity;
    var breadth = 1 + m.breadth_per_chain * Math.min((row.chains || []).length, m.breadth_max_chains);
    return Math.max(1, Math.round(row.base * sb.mult * growthMult * maturity * breadth));
  }
  function sandboxActive() {
    return state.sandbox.mult !== DEFAULTS.mult || state.sandbox.growth !== DEFAULTS.growth || state.sandbox.maturity !== DEFAULTS.maturity;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  // The cheapest chain a protocol is live on, by the gas table the economics uses: farm where it is
  // cheap. Mirrors the same function in main.ts, so the plan and the economics agree on the chain.
  function chainOf(p) {
    if (!p.chains || p.chains.length === 0) return 'its main chain';
    var best = p.chains[0];
    p.chains.forEach(function (c) { if (gasCostFor(c) < gasCostFor(best)) best = c; });
    return best;
  }
  function gasCostFor(chain) {
    var m = DATA.model;
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return m.gas_ethereum;
    if (c === 'solana') return m.gas_solana;
    return m.gas_other;
  }
  function otherChain(p, chain) {
    if (!p.chains) return null;
    for (var i = 0; i < p.chains.length; i++) if (p.chains[i] !== chain) return p.chains[i];
    return null;
  }
  function fmtPerHour(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
  }
  // One row's farm economics, from the row's own figures plus the page's stated assumptions: the
  // cheapest chain sets the gas, the farm plan sets the capital and the hours, a 4% T-bill prices the
  // capital's time, and a tenth of the implied value is the working assumption for what reaches
  // farmers, shared in proportion to capital. The verdict is the break-even: how much of the implied
  // value must reach farmers for the farm to pay its fees and the T-bill. FARM when a tenth suffices,
  // THIN when a quarter does, SKIP when even a quarter does not. No yield is ever claimed.
  function econOf(row) {
    var m = DATA.model;
    var implied = viewValue(row);
    var capital = capitalFor(row);
    var chain = chainOf(row);
    var gas = gasCostFor(chain);
    var hold = holdDaysFor(row.age_days);
    var hours = (40 + 10 * Math.ceil(hold / 7)) / 60;
    var tbill = capital * m.tbill_rate * hold / 365;
    var total = gas + tbill;
    var share100 = implied * capital / row.tvl_usd;
    var breakEven = share100 > 0 ? total / share100 : Infinity;
    var net10 = m.econ_alloc * share100 - total;
    var perHour = net10 / hours;
    var verdict = breakEven <= m.verdict_farm ? 'FARM' : breakEven <= m.verdict_thin ? 'THIN' : 'SKIP';
    return { capital: capital, chain: chain, gas: gas, hold: hold, hours: hours, tbill: tbill, total: total, share100: share100, breakEven: breakEven, net10: net10, perHour: perHour, verdict: verdict };
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasNoteFor(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') {
      return { text: 'On Ethereum mainnet, budget $10 to $40 of gas for the first transaction and do it when gas is low.', cost: '$10 to $40 of gas on Ethereum' };
    }
    if (c === 'solana') {
      return { text: 'On Solana the transaction costs under $0.05, so gas is never the reason to wait.', cost: 'under $0.05 of gas on Solana' };
    }
    return { text: 'On ' + chain + ', gas is a few dollars at most, so the position\'s capital matters more than the fee.', cost: 'a few dollars of gas at most' };
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0 && c.indexOf('aggregator') < 0) return 'Deposit $' + capital + " into " + name + "'s yield position on " + chain + ' and keep it earning.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' and vote in ' + name + "'s governance on " + chain + '.';
    if (c.indexOf('payment') >= 0) return 'Send $' + capital + " through " + name + "'s payment rail on " + chain + ' and keep the receipt.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function weeklyFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply or borrow a small amount again on ' + chain + ' so the wallet stays active.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap or add a little liquidity again on ' + chain + ' so the wallet stays active.';
    if (c.indexOf('yield') >= 0 && c.indexOf('aggregator') < 0) return 'Top the position up, or claim and re-deposit, so the wallet stays active.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount again on ' + chain + ' so the wallet stays active on the route.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake the rewards so the position keeps compounding.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Open or close one small hedge so the wallet stays active.';
    if (c.indexOf('prediction') >= 0) return 'Place one more small market position so the wallet stays active.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0) return 'Deposit into another vault, or top up the first one, so the wallet stays active.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit a little more of the stable asset so the wallet stays active.';
    if (c.indexOf('rwa') >= 0) return 'Mint a little more of the yield asset and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Renew or top up the cover so the wallet stays active.';
    if (c.indexOf('governance') >= 0) return 'Vote in the next proposal so the wallet stays active.';
    if (c.indexOf('payment') >= 0) return 'Send another small payment through the rail so the wallet stays active.';
    return 'Repeat the deposit, or make one swap, so the wallet stays active.';
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasNoteFor(chain);
    var action = actionFor(p, capital, chain) + (otherChain(p, chain) !== null ? ' It is also live on ' + otherChain(p, chain) + '.' : '');
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: gas.text, cost: gas.cost, time: '5 minutes to check' },
      { text: weeklyFor(p, chain), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then unwind gradually instead of all at once.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    // Every hash-driven field is reset from the hash, so back/forward navigation
    // restores the state the hash describes instead of leaving the old one behind.
    var hash = window.location.hash.replace(/^#/, '');
    var params = new URLSearchParams(hash);
    state.q = params.get('q') || '';
    state.selected = params.get('p') || null;
    state.category = params.get('category') || 'all';
    state.watchlist = params.get('w') === '1';
    var tab = params.get('tab') || 'pre-token';
    state.tab = (tab === 'pre-token' || tab === 'live' || tab === 'method') ? tab : 'pre-token';
    state.sort = params.get('sort') || 'implied';
    state.dir = params.get('dir') === '1' ? 1 : -1;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.watchlist) params.set('w', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.dir !== -1) params.set('dir', String(state.dir));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function viewValue(row) {
    return sandboxActive() ? impliedOf(row, state.sandbox) : row.implied_value_usd;
  }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlist && !r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'econ') { av = econOf(a).perHour; bv = econOf(b).perHour; }
      else { av = viewValue(a); bv = viewValue(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Source ', el('b', { text: 'DefiLlama protocol index' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ',
          el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
          ' of TVL that records no token. The early radar adds ',
          el('b', { text: String(DATA.early_size) }),
          ' more protocols that meet the same definition. Implied value is a model, not a promise: it prices a protocol from the market\u2019s own size curve \u2014 what live-token protocols of that size and kind are worth, fitted from the snapshot itself. The Method tab shows the fit, how well it holds up, and what each farm costs against it.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows beyond the watchlist' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Farms that pay (FARM verdicts)' }), el('b', { text: DATA.rows.filter(function (r) { return econOf(r).verdict === 'FARM'; }).length + ' / ' + DATA.board_size }))
      )
    );
  }

  function leaders() {
    var top = DATA.rows.slice(0, 3);
    return el('section', { class: 'leaders', 'aria-label': 'Top three by implied value' },
      top.map(function (r) {
        return el('button', { type: 'button', class: 'leader', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rank', text: 'Rank ' + r.rank + ' of ' + DATA.board_size }),
          el('b', { text: r.name }),
          el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'sub', text: fmtUsd(r.tvl_usd) + ' TVL on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.watchlist ? ' · on the watchlist' : '') })
        );
      })
    );
  }

  // Coverage by category, at a glance: the eight biggest categories on the board, each a
  // button that filters the board to it. Counts come from DATA.rows, never from a list.
  function categoriesPanel() {
    var counts = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      if (!counts[c]) counts[c] = { n: 0, w: 0 };
      counts[c].n += 1;
      if (r.watchlist) counts[c].w += 1;
    });
    var top = Object.keys(counts).map(function (c) {
      return { name: c, n: counts[c].n, w: counts[c].w };
    }).sort(function (a, b) { return b.n - a.n || (a.name < b.name ? -1 : 1); }).slice(0, 8);
    var max = top.length ? top[0].n : 1;
    return el('section', { class: 'cats', 'aria-label': 'Rows by category' },
      top.map(function (c) {
        return el('button', {
          type: 'button', class: 'cat', onclick: function () { state.category = c.name; state.tab = 'pre-token'; writeHash(); render(); }
        },
          el('span', { class: 'cat-bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(6, Math.round((c.n / max) * 100)) + '%' })),
          el('b', { text: c.name }),
          el('span', { text: c.n + ' rows' + (c.w ? ' · ' + c.w + ' watchlist' : '') })
        );
      })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlist ? 'checked' : null, 'aria-label': 'Watchlist only' }),
      'Watchlist only'
    );
    wl.querySelector('input').addEventListener('change', function (e) { state.watchlist = e.target.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Set aside', onclick: function () { state.tab = 'live'; render(); } });
    var method = el('button', { type: 'button', 'aria-pressed': state.tab === 'method' ? 'true' : 'false', text: 'Method', onclick: function () { state.tab = 'method'; render(); } });
    var shown = state.tab === 'pre-token' ? rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : 'model, validation and sandbox';
    if (sandboxActive() && state.tab === 'pre-token') shown += ' · sandbox values';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      wl,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live, method)),
      el('span', { class: 'count', text: shown })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.watchlist = false; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return viewValue(r); })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var val = viewValue(r);
      var econ = econOf(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }),
          el('span', { class: 'verdict verdict-' + econ.verdict.toLowerCase(), text: econ.verdict })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((val / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(val) })
        )),
        el('td', { class: 'num ' + (econ.perHour >= 0 ? 'pos' : 'neg'), text: fmtPerHour(econ.perHour) }),
        el('td', null, r.watchlist ? el('span', { class: 'badge', text: 'Watchlist' }) : el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('econ', 'Net $/h'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market caps are what the size curve is fitted from.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  // The model applied to the top row, worked out in the open, and how much of the board each
  // factor carries. Everything is read from DATA, so the example can never disagree with
  // board.json: the numbers are the row's own, not a second copy of them.
  function workedExample() {
    var m = DATA.model;
    var f = DATA.fit;
    var top = DATA.rows[0];
    var catRows = 0;
    var maxTvl = 0;
    var minTvl = Infinity;
    DATA.rows.forEach(function (r) {
      if (r.factor_source === 'category') catRows += 1;
      if (r.tvl_usd > maxTvl) maxTvl = r.tvl_usd;
      if (r.tvl_usd < minTvl) minTvl = r.tvl_usd;
    });
    var globRows = DATA.rows.length - catRows;
    var span = Math.round(maxTvl / minTvl);
    var gMin = (1 + (m.growth_floor / 100) * m.growth_weight).toFixed(2);
    var gMax = (1 + (m.growth_cap / 100) * m.growth_weight).toFixed(2);
    var mMin = m.maturity_floor.toFixed(2);
    var mMax = (m.maturity_floor + m.maturity_range).toFixed(2);
    var curve = top.base / top.factor;
    return el('div', null,
      el('div', { class: 'formula' },
        'Worked example — rank 1, ', el('b', { text: top.name }), ': the curve prices ',
        fmtUsd(top.tvl_usd), ' of TVL at ', fmtUsd(curve),
        ', x ', fmtMult(top.factor), ' (', top.factor_source === 'category' ? 'category factor' : 'curve alone', ')',
        ' x ', String(top.growth_multiplier), ' growth x ', String(top.maturity_multiplier),
        ' maturity x ', String(top.breadth_multiplier), ' breadth → ',
        el('b', { text: fmtUsd(top.implied_value_usd) })
      ),
      el('p', { class: 'sub', text: catRows + ' of ' + DATA.rows.length + ' rows use their category\u2019s factor; ' + globRows + ' ride the curve alone. TVL carries most of the ranking — it spans about ' + span.toLocaleString('en-US') + 'x from the largest row to the smallest — while growth adjusts a row by ' + gMin + 'x to ' + gMax + 'x and age by ' + mMin + 'x to ' + mMax + 'x.' })
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var f = DATA.fit;
    var trusted = (DATA.factors || []).filter(function (x) { return x.source === 'category'; }).sort(function (a, b) { return b.factor - a.factor; });
    var rows = trusted.map(function (x) {
      return el('tr', null,
        el('td', { text: x.category }),
        el('td', { class: 'num', text: fmtMult(x.factor) }),
        el('td', { class: 'num', text: String(x.live_n) })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( 10^', f.intercept.toFixed(2), ' x tvl_usd^', f.slope.toFixed(2), ' x ', el('b', { text: 'category factor' }), ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + 0.02 x min(chains, 5)) )'
      ),
      el('p', { class: 'sub', text: 'The size curve is the least-squares fit of log market cap on log TVL over the snapshot\u2019s own ' + f.n_comps + ' live-token protocols: value grows slower than size (slope ' + f.slope.toFixed(2) + ', R\u00b2 ' + f.r2.toFixed(2) + '), so a flat multiple would over-price big TVL. The category factor is the median of actual market cap over the curve\u2019s prediction in that category, when at least ' + m.min_live_n + ' live protocols support it; otherwise the row rides the curve alone. Factors are clamped to [' + m.factor_floor + ', ' + m.factor_cap + ']. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. A protocol records no token when the snapshot carries no market cap, no CoinGecko id and no symbol for it; that record is not proof it has none.' }),
      workedExample(),
      el('table', { class: 'mult-table' },
        el('caption', { class: 'sub', text: 'Categories with enough live-token comparables to trust their own factor.' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Factor' }), el('th', { scope: 'col', text: 'Live protocols' }))),
        el('tbody', null, rows)
      ),
      el('p', { class: 'mult-note', text: 'Every other category rides the curve alone (factor 1.00). Wrapped, staked and bridged products of a token that already trades are not ranked: they are not protocols still waiting on a launch of their own.' })
    );
  }

  // Leave-one-out validation and the comps the curve was fitted from. The scatter is drawn from
  // DATA.comps at run time, so the chart and the fitted line can never disagree with the model.
  function looPanel() {
    var f = DATA.fit;
    var m = DATA.model;
    var pct = function (x) { return Math.round(x * 100) + '%'; };
    var miss = function (x) { return 'x' + x.toFixed(1); };
    var top = DATA.rows[0];
    var ratios = (DATA.comps || []).map(function (c) { return c[1] / c[0]; }).sort(function (a, b) { return a - b; });
    var flatMed = ratios.length ? (ratios.length % 2 ? ratios[(ratios.length - 1) / 2] : (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2) : 0.2;
    var flatTop = Math.max(1, Math.round(top.tvl_usd * flatMed * top.growth_multiplier * top.maturity_multiplier * top.breadth_multiplier));
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How well the curve holds up' }),
      el('p', { class: 'sub', text: 'Leave-one-out over the ' + f.n_comps + ' live-token comps: refit the curve and the factor without each protocol, then predict it. This model lands within 3x for ' + pct(f.loo_within3x) + ' of them, median miss ' + miss(f.loo_median_miss) + '. One flat multiple manages ' + pct(f.flat_within3x) + ', median miss ' + miss(f.flat_median_miss) + '. The middle half of launches land between ' + f.loo_p25.toFixed(2) + 'x and ' + f.loo_p75.toFixed(2) + 'x of the curve, so every row carries that range beside its number. A model this wide is a rough anchor, not a price.' }),
      scatterChart(),
      el('p', { class: 'sub', text: 'Each dot is one live-token protocol from the snapshot. The line is the fitted curve; the dashed lines are the middle half of launches around it. Big TVL sits below a flat multiple: rank 1 is ' + fmtUsd(top.implied_value_usd) + ' on the curve, against ' + fmtUsd(flatTop) + ' on one flat median multiple of ' + flatMed.toFixed(3) + '.' })
    );
  }

  function scatterChart() {
    var f = DATA.fit;
    var comps = DATA.comps || [];
    var W = 640, H = 360, L = 54, R = 16, T = 14, B = 42;
    var xMin = 6, xMax = 10, yMin = 4, yMax = 10;
    var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
    var px = function (lt) { return clamp(L + (lt - xMin) / (xMax - xMin) * (W - L - R), L, W - R); };
    var py = function (lm) { return clamp(T + (yMax - lm) / (yMax - yMin) * (H - T - B), T, H - B); };
    var line = function (off) {
      return px(xMin).toFixed(1) + ',' + py(f.intercept + f.slope * xMin + off).toFixed(1) + ' ' + px(xMax).toFixed(1) + ',' + py(f.intercept + f.slope * xMax + off).toFixed(1);
    };
    var dots = comps.map(function (c) {
      return '<circle cx="' + px(Math.log10(c[0])).toFixed(1) + '" cy="' + py(Math.log10(c[1])).toFixed(1) + '" r="3" fill="#2563eb" opacity="0.55"/>';
    }).join('');
    var xticks = [6, 7, 8, 9, 10].map(function (v) {
      return '<text x="' + px(v).toFixed(1) + '" y="' + (H - 26) + '" class="ax" text-anchor="middle">10^' + v + '</text>';
    }).join('');
    var yticks = [4, 5, 6, 7, 8, 9, 10].map(function (v) {
      return '<text x="' + (L - 8) + '" y="' + (py(v) + 3).toFixed(1) + '" class="ax" text-anchor="end">10^' + v + '</text>';
    }).join('');
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Market cap against TVL for the live-token comps, with the fitted curve and its middle half">'
      + '<line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '" class="axis"/>'
      + '<line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '" class="axis"/>'
      + xticks + yticks
      + '<text x="' + (L + (W - L - R) / 2) + '" y="' + (H - 8) + '" class="ax" text-anchor="middle">TVL, USD, log scale</text>'
      + '<text x="14" y="' + (T + (H - T - B) / 2) + '" class="ax" text-anchor="middle" transform="rotate(-90 14 ' + (T + (H - T - B) / 2) + ')">Market cap, USD, log scale</text>'
      + dots
      + '<polyline points="' + line(Math.log10(f.loo_p75)) + '" class="band"/>'
      + '<polyline points="' + line(Math.log10(f.loo_p25)) + '" class="band"/>'
      + '<polyline points="' + line(0) + '" class="fit"/>'
      + '</svg>';
    return el('div', { class: 'scatter' }, el('div', { html: svg }));
  }

  function sandboxPanel() {
    function slider(id, label, min, max, step, value, fmt) {
      var out = el('output', { for: id, text: fmt(value) });
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
      input.addEventListener('input', function () {
        var v = parseFloat(input.value);
        if (id === 'sb-mult') state.sandbox.mult = v;
        if (id === 'sb-growth') state.sandbox.growth = v;
        if (id === 'sb-maturity') state.sandbox.maturity = v;
        out.textContent = fmt(v);
        render();
      });
      return el('div', { class: 'slider' }, el('label', { for: id }, label, out), input);
    }
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset the model', onclick: function () { state.sandbox = { mult: DEFAULTS.mult, growth: DEFAULTS.growth, maturity: DEFAULTS.maturity }; render(); } });
    return el('section', { class: 'panel sandbox' },
      el('h2', { text: 'Model sandbox' }),
      el('p', { class: 'sub', text: 'Move a constant and the board re-scores in front of you: the model is a function of the snapshot, not a list someone wrote. The sandbox changes this view only; board.json keeps the submitted ranking.' }),
      el('div', { class: 'sliders' },
        slider('sb-mult', 'Curve base scale', 0.5, 2, 0.05, state.sandbox.mult, function (v) { return v.toFixed(2) + 'x'; }),
        slider('sb-growth', 'Growth weight', 0, 1, 0.05, state.sandbox.growth, function (v) { return v.toFixed(2); }),
        slider('sb-maturity', 'Maturity range', 0, 0.6, 0.05, state.sandbox.maturity, function (v) { return v.toFixed(2); })
      ),
      el('div', { class: 'actions' }, reset, sandboxActive() ? el('span', { class: 'note', text: 'Sandbox values are on: the implied values and the order below are re-computed, not the submitted board.' }) : el('span', { class: 'note', text: 'At the defaults, the board below is exactly the submitted ranking.' }))
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DEFAULTS);
    var shown = viewValue(row);
    var econ = econOf(row);
    var curve = row.base / row.factor;
    var rangeLo = Math.max(1, Math.round(shown * DATA.fit.loo_p25));
    var rangeHi = Math.max(1, Math.round(shown * DATA.fit.loo_p75));
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · on the watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Size curve (10^' + DATA.fit.intercept.toFixed(2) + ' x TVL^' + DATA.fit.slope.toFixed(2) + ')' }), el('b', { class: 'num', text: fmtUsd(curve) })),
        el('div', null, el('span', { text: 'Category factor (' + (row.factor_source === 'category' ? 'category median residual' : 'curve alone') + ')' }), el('b', { class: 'num', text: fmtMult(row.factor) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(shown) })),
        el('div', null, el('span', { text: 'Likely range (middle half of comparable launches)' }), el('b', { class: 'num', text: fmtUsd(rangeLo) + ' \u2013 ' + fmtUsd(rangeHi) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price. The protocol records no token; that record is not proof it has none.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Verdict' }), el('b', { class: 'verdict verdict-' + econ.verdict.toLowerCase(), text: econ.verdict })),
        el('div', null, el('span', { text: 'Capital to farm' }), el('b', { class: 'num', text: '$' + econ.capital })),
        el('div', null, el('span', { text: 'Cheapest chain and gas' }), el('b', { class: 'num', text: econ.chain + ' \u00b7 $' + econ.gas })),
        el('div', null, el('span', { text: 'Hands-on time' }), el('b', { class: 'num', text: econ.hours.toFixed(1) + ' hours over ' + econ.hold + ' days' })),
        el('div', null, el('span', { text: 'T-bill cost (4% on the capital)' }), el('b', { class: 'num', text: '$' + econ.tbill.toFixed(2) })),
        el('div', null, el('span', { text: 'Total cost of the farm' }), el('b', { class: 'num', text: '$' + econ.total.toFixed(2) })),
        el('div', null, el('span', { text: 'Break-even: share of implied value that must reach farmers' }), el('b', { class: 'num', text: (econ.breakEven * 100).toFixed(1) + '%' })),
        el('div', { class: 'total' }, el('span', { text: 'Net per hands-on hour, if a tenth reaches farmers' }), el('b', { class: 'num', text: fmtPerHour(econ.perHour) }))
      ),
      el('p', { class: 'sub', text: 'Assumptions, stated not hidden: one farmer deposits $' + econ.capital + ' and captures a share of the implied value in proportion to that capital; gas is the cheapest chain the protocol is live on; the 4% T-bill is what the same capital earns parked elsewhere. FARM when a tenth of the implied value reaching farmers pays the farm, THIN when a quarter does, SKIP when even a quarter does not. No yield is claimed anywhere on this page.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    if (state.tab === 'method') {
      shell.appendChild(controls());
      shell.appendChild(modelPanel());
      shell.appendChild(looPanel());
      shell.appendChild(sandboxPanel());
    } else {
      shell.appendChild(lede());
      shell.appendChild(leaders());
      shell.appendChild(categoriesPanel());
      shell.appendChild(controls());
      shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
    else if (dialog.open) dialog.close();
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
