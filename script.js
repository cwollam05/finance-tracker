// ── UI HELPERS ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  $(`${name}-screen`).classList.remove('hidden');
}

function showError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearError(id) {
  $(id).textContent = '';
  $(id).classList.add('hidden');
}

// ── AUTH TABS ──────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $('login-form').classList.toggle('hidden', tab !== 'login');
    $('signup-form').classList.toggle('hidden', tab !== 'signup');
    clearError('login-error');
    clearError('signup-error');
  });
});

// ── AUTH ───────────────────────────────────────────────────────
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  clearError('login-error');

  const email    = $('login-email').value.trim();
  const password = $('login-password').value;

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    showError('login-error', error.message);
    return;
  }

  onLogin(data.user);
});

$('signup-form').addEventListener('submit', async e => {
  e.preventDefault();
  clearError('signup-error');

  const name     = $('signup-name').value.trim();
  const email    = $('signup-email').value.trim();
  const password = $('signup-password').value;

  if (password.length < 8) {
    showError('signup-error', 'Password must be at least 8 characters.');
    return;
  }

  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });

  if (error) {
    showError('signup-error', error.message);
    return;
  }

  // Supabase may require email confirmation depending on your project settings.
  // If email confirmation is disabled the session is available immediately.
  if (data.session) {
    onLogin(data.user);
  } else {
    showError('signup-error', 'Check your email to confirm your account, then log in.');
  }
});

$('logout-btn').addEventListener('click', async () => {
  await db.auth.signOut();
  transactions  = [];
  currentUser   = null;
  showScreen('auth');
});

function onLogin(user) {
  currentUser = user;
  const name = user.user_metadata?.full_name || user.email.split('@')[0];
  $('nav-username').textContent = name;
  showScreen('app');
  initApp();
}

// ── APP STATE ──────────────────────────────────────────────────
let transactions  = [];
let currentUser   = null;
let currentBudget = null; // { id, limit_amount } for the current month
let exchangeRates = {};   // { EUR: 0.92, GBP: 0.79, ... } — rates from USD

const defaultCategories = [
  { id: 'c1', name: 'Housing',       type: 'expense' },
  { id: 'c2', name: 'Food',          type: 'expense' },
  { id: 'c3', name: 'Transport',     type: 'expense' },
  { id: 'c4', name: 'Entertainment', type: 'expense' },
  { id: 'c5', name: 'Health',        type: 'expense' },
  { id: 'c6', name: 'Salary',        type: 'income'  },
  { id: 'c7', name: 'Freelance',     type: 'income'  },
  { id: 'c8', name: 'Other',         type: 'income'  },
];

async function initApp() {
  setMonthLabel();
  populateCategoryDropdowns();
  setDefaultDate();
  await Promise.all([loadTransactions(), loadBudget(), loadExchangeRates()]);
  initCurrencySelector();
}

// ── DATE HELPERS ───────────────────────────────────────────────
function setMonthLabel() {
  const now = new Date();
  $('current-month').textContent = now.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function setDefaultDate() {
  $('tx-date').value = new Date().toISOString().split('T')[0];
}

// ── CATEGORIES ─────────────────────────────────────────────────
function populateCategoryDropdowns() {
  [$('tx-category'), $('filter-category')].forEach(sel => {
    while (sel.options.length > 1) sel.remove(1);
    defaultCategories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      sel.appendChild(opt);
    });
  });
}

function getCategoryName(id) {
  return defaultCategories.find(c => c.id === id)?.name ?? '—';
}

// ── LOAD TRANSACTIONS ──────────────────────────────────────────
async function loadTransactions() {
  const { data, error } = await db
    .from('transactions')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('date', { ascending: false });

  if (error) {
    console.error('Failed to load transactions:', error.message);
    return;
  }

  transactions = data;
  renderTransactions();
  updateDashboard();
}

// ── EXCHANGE RATES (Frankfurter API + localStorage cache) ───────
const RATES_CACHE_KEY = 'fx_rates_cache';
const RATES_TTL_MS    = 60 * 60 * 1000; // 1 hour

async function loadExchangeRates() {
  // Check cache first
  try {
    const cached = JSON.parse(localStorage.getItem(RATES_CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.timestamp < RATES_TTL_MS) {
      exchangeRates = cached.rates;
      return;
    }
  } catch {}

  // Fetch from Frankfurter (free, no API key)
  try {
    const res  = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,CAD,AUD,JPY,MXN,CNY,INR');
    const data = await res.json();
    exchangeRates = data.rates; // e.g. { EUR: 0.92, GBP: 0.79, ... }
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ rates: exchangeRates, timestamp: Date.now() }));
  } catch {
    console.warn('Could not load exchange rates — defaulting to USD only.');
  }
}

// Convert amount in `currency` to USD
function toUSD(amount, currency) {
  if (currency === 'USD' || !exchangeRates[currency]) return amount;
  return amount / exchangeRates[currency];
}

// Currency selector — show live conversion note as user types
function initCurrencySelector() {
  const amountInput  = $('tx-amount');
  const currencySelect = $('tx-currency');
  const convertedNote = $('tx-converted');

  function updateConvertedNote() {
    const currency = currencySelect.value;
    const amount   = parseFloat(amountInput.value);
    if (currency === 'USD' || !amount || !exchangeRates[currency]) {
      convertedNote.classList.add('hidden');
      return;
    }
    const usd = toUSD(amount, currency);
    convertedNote.textContent = `≈ $${usd.toFixed(2)} USD`;
    convertedNote.classList.remove('hidden');
  }

  amountInput.addEventListener('input', updateConvertedNote);
  currencySelect.addEventListener('change', updateConvertedNote);
}

// ── AI INSIGHTS (Claude via streaming SSE) ──────────────────────
const INSIGHTS_CACHE_KEY = 'insights_cache';

$('analyze-btn').addEventListener('click', analyzeSpending);

async function analyzeSpending() {
  const btn    = $('analyze-btn');
  const output = $('insights-output');
  const text   = $('insights-text');
  const empty  = $('insights-empty');
  const error  = $('insights-error');

  // Get this month's transactions
  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  const monthly = transactions.filter(tx => {
    const d = new Date(tx.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  if (monthly.length === 0) {
    error.textContent = 'No transactions this month to analyze yet.';
    error.classList.remove('hidden');
    empty.classList.add('hidden');
    return;
  }

  // Check cache — keyed by a simple fingerprint (count + total amount)
  const totalAmt     = monthly.reduce((s, t) => s + Number(t.amount), 0);
  const fingerprint  = `${monthly.length}-${totalAmt.toFixed(2)}-${currentBudget?.limit_amount ?? 0}`;
  try {
    const cached = JSON.parse(localStorage.getItem(INSIGHTS_CACHE_KEY) || 'null');
    if (cached && cached.fingerprint === fingerprint) {
      showInsightsResult(cached.text);
      return;
    }
  } catch {}

  // Enrich transactions with category names for the prompt
  const enriched = monthly.map(tx => ({
    ...tx,
    category_name: getCategoryName(tx.category_id),
  }));

  // UI: loading state
  btn.disabled     = true;
  btn.textContent  = 'Analyzing…';
  error.classList.add('hidden');
  empty.classList.add('hidden');
  output.classList.remove('hidden');
  text.textContent = '';
  text.classList.add('streaming');

  try {
    const res = await fetch('/api/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: enriched, budget: currentBudget }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server error ${res.status}`);
    }

    // Read the SSE stream from Anthropic passed through our edge function
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   fullText = '';
    let   buffer   = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            fullText       += parsed.delta.text;
            text.textContent = fullText;
          }
        } catch {}
      }
    }

    text.classList.remove('streaming');

    // Cache the result
    localStorage.setItem(INSIGHTS_CACHE_KEY, JSON.stringify({ fingerprint, text: fullText }));

  } catch (err) {
    text.classList.remove('streaming');
    output.classList.add('hidden');
    empty.classList.add('hidden');
    error.textContent = `Insights error: ${err.message}`;
    error.classList.remove('hidden');
    console.error('Insights error:', err);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Analyze';
  }
}

function showInsightsResult(content) {
  $('insights-empty').classList.add('hidden');
  $('insights-error').classList.add('hidden');
  $('insights-output').classList.remove('hidden');
  $('insights-text').textContent = content;
  $('insights-text').classList.remove('streaming');
}

// ── BUDGET ─────────────────────────────────────────────────────
function currentMonthKey() {
  const now = new Date();
  // First day of the current month as YYYY-MM-DD (used as the row key)
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

async function loadBudget() {
  const { data, error } = await db
    .from('budgets')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('month', currentMonthKey())
    .maybeSingle();

  if (error) { console.error('Failed to load budget:', error.message); return; }

  currentBudget = data; // null if no budget set yet
  renderBudget();
}

$('edit-budget-btn').addEventListener('click', () => {
  if (currentBudget) $('budget-amount').value = currentBudget.limit_amount;
  $('budget-form').classList.remove('hidden');
  $('budget-display').classList.add('hidden');
  $('budget-empty').classList.add('hidden');
  $('budget-amount').focus();
});

$('cancel-budget-btn').addEventListener('click', () => {
  $('budget-form').classList.add('hidden');
  renderBudget();
});

$('budget-form').addEventListener('submit', async e => {
  e.preventDefault();
  const limit = parseFloat($('budget-amount').value);
  if (!limit || limit <= 0) return;

  let result;
  if (currentBudget) {
    // Update existing row
    result = await db
      .from('budgets')
      .update({ limit_amount: limit })
      .eq('id', currentBudget.id)
      .select()
      .single();
  } else {
    // Insert new row
    result = await db
      .from('budgets')
      .insert({ user_id: currentUser.id, month: currentMonthKey(), limit_amount: limit })
      .select()
      .single();
  }

  if (result.error) { console.error(result.error.message); return; }

  currentBudget = result.data;
  $('budget-form').classList.add('hidden');
  renderBudget();
});

function renderBudget() {
  const now      = new Date();
  const month    = now.getMonth();
  const year     = now.getFullYear();

  const spent = transactions
    .filter(tx => {
      const d = new Date(tx.date);
      return tx.type === 'expense' && d.getMonth() === month && d.getFullYear() === year;
    })
    .reduce((s, t) => s + Number(t.amount), 0);

  if (!currentBudget) {
    $('budget-display').classList.add('hidden');
    $('budget-empty').classList.remove('hidden');
    $('edit-budget-btn').textContent = 'Set Budget';
    return;
  }

  $('budget-empty').classList.add('hidden');
  $('budget-display').classList.remove('hidden');
  $('edit-budget-btn').textContent = 'Edit';

  const limit  = Number(currentBudget.limit_amount);
  const pct    = Math.min((spent / limit) * 100, 100);
  const over   = spent > limit;
  const warn   = !over && pct >= 80;

  const fill = $('budget-bar-fill');
  fill.style.width = pct + '%';
  fill.className   = 'budget-bar-fill' + (over ? ' danger' : warn ? ' warn' : '');

  $('budget-pct').textContent        = Math.round((spent / limit) * 100) + '%';
  $('budget-spent-label').textContent = `$${spent.toFixed(2)} spent`;
  $('budget-limit-label').textContent = `Limit: $${limit.toFixed(2)}`;

  const status = $('budget-status');
  if (over) {
    status.textContent  = `Over budget by $${(spent - limit).toFixed(2)}`;
    status.className    = 'budget-status danger';
  } else if (warn) {
    status.textContent  = `${Math.round(pct)}% of budget used — almost there`;
    status.className    = 'budget-status warn';
  } else {
    status.textContent  = `$${(limit - spent).toFixed(2)} remaining`;
    status.className    = 'budget-status ok';
  }
}

// ── TRANSACTION FORM ───────────────────────────────────────────
$('transaction-form').addEventListener('submit', async e => {
  e.preventDefault();
  clearError('tx-error');

  const type        = document.querySelector('input[name="type"]:checked').value;
  const description = $('tx-description').value.trim();
  const rawAmount   = parseFloat($('tx-amount').value);
  const currency    = $('tx-currency').value;
  const category_id = $('tx-category').value || null;
  const date        = $('tx-date').value;

  if (!description || !rawAmount || !date) {
    showError('tx-error', 'Please fill in all required fields.');
    return;
  }

  // Convert to USD before storing
  const amount = parseFloat(toUSD(rawAmount, currency).toFixed(2));

  const { data, error } = await db
    .from('transactions')
    .insert({ user_id: currentUser.id, type, description, amount, category_id, date })
    .select()
    .single();

  if (error) {
    showError('tx-error', error.message);
    return;
  }

  transactions.unshift(data);
  renderTransactions();
  updateDashboard();
  renderBudget();
  $('transaction-form').reset();
  $('tx-currency').value = 'USD';
  $('tx-converted').classList.add('hidden');
  setDefaultDate();
});

// ── RENDER TRANSACTIONS ────────────────────────────────────────
$('filter-category').addEventListener('change', renderTransactions);
$('filter-type').addEventListener('change', renderTransactions);

function renderTransactions() {
  const filterCat  = $('filter-category').value;
  const filterType = $('filter-type').value;

  const list = transactions.filter(tx => {
    if (filterCat  && tx.category_id !== filterCat)  return false;
    if (filterType && tx.type        !== filterType)  return false;
    return true;
  });

  const container = $('transaction-list');

  if (list.length === 0) {
    container.innerHTML = '<p class="empty-state">No transactions yet. Add one above!</p>';
    return;
  }

  container.innerHTML = list.map(tx => `
    <div class="tx-item" data-id="${tx.id}">
      <div class="tx-left">
        <span class="tx-dot ${tx.type}"></span>
        <div class="tx-info">
          <p class="tx-desc">${escapeHtml(tx.description)}</p>
          <p class="tx-meta">${formatDate(tx.date)} · ${getCategoryName(tx.category_id)}</p>
        </div>
      </div>
      <div class="tx-right">
        <span class="tx-amount ${tx.type}">
          ${tx.type === 'expense' ? '-' : '+'}$${Number(tx.amount).toFixed(2)}
        </span>
        <button class="btn-icon-danger" data-delete="${tx.id}" title="Delete">✕</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteTransaction(btn.dataset.delete));
  });
}

async function deleteTransaction(id) {
  const { error } = await db.from('transactions').delete().eq('id', id);

  if (error) {
    alert('Could not delete transaction: ' + error.message);
    return;
  }

  transactions = transactions.filter(t => t.id !== id);
  renderTransactions();
  updateDashboard();
  renderBudget();
}

// ── DASHBOARD ──────────────────────────────────────────────────
function updateDashboard() {
  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  const monthly = transactions.filter(tx => {
    const d = new Date(tx.date);
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const income   = monthly.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expenses = monthly.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const balance  = income - expenses;

  $('total-income').textContent   = formatCurrency(income);
  $('total-expenses').textContent = formatCurrency(expenses);
  $('net-balance').textContent    = formatCurrency(balance);
  $('net-balance').style.color    = balance >= 0 ? 'var(--green)' : 'var(--red)';
}

// ── FORMAT HELPERS ─────────────────────────────────────────────
function formatCurrency(n) {
  return '$' + Math.abs(n).toFixed(2);
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return new Date(y, m - 1, d).toLocaleDateString('default', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ── RESTORE SESSION ON PAGE LOAD ───────────────────────────────
// If the user is already logged in (e.g. after a page refresh), skip the auth screen.
(async () => {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    onLogin(session.user);
  } else {
    showScreen('auth');
  }
})();
