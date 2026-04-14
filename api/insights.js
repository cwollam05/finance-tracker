export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { transactions, budget } = await req.json();

  const now   = new Date();
  const month = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Summarise transactions for the prompt
  const expenses = transactions.filter(t => t.type === 'expense');
  const income   = transactions.filter(t => t.type === 'income');

  const totalExpenses = expenses.reduce((s, t) => s + Number(t.amount), 0);
  const totalIncome   = income.reduce((s, t) => s + Number(t.amount), 0);

  // Group expenses by category
  const byCategory = {};
  expenses.forEach(t => {
    const cat = t.category_name || t.category_id || 'Uncategorized';
    byCategory[cat] = (byCategory[cat] || 0) + Number(t.amount);
  });

  const categoryBreakdown = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `  • ${cat}: $${amt.toFixed(2)}`)
    .join('\n');

  const budgetLine = budget
    ? `Monthly budget limit: $${Number(budget.limit_amount).toFixed(2)}`
    : 'No monthly budget set.';

  const prompt = `You are a helpful personal finance assistant. Analyze this user's spending data for ${month} and provide 3–4 concise, actionable insights.

Data:
- Total income: $${totalIncome.toFixed(2)}
- Total expenses: $${totalExpenses.toFixed(2)}
- Net balance: $${(totalIncome - totalExpenses).toFixed(2)}
- ${budgetLine}
- Number of transactions: ${transactions.length}

Expense breakdown by category:
${categoryBreakdown || '  (no categorized expenses)'}

Instructions:
- Be specific and reference the actual numbers
- Keep each insight to 1–2 sentences
- Use plain text only — no markdown, no headers, no bullet symbols
- Start each insight on a new line with a number (1. 2. 3. etc.)
- End with one short encouraging or cautionary closing remark based on the overall picture`;

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return new Response(JSON.stringify({ error: err }), {
      status: anthropicRes.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Pass the Anthropic SSE stream straight through to the client
  return new Response(anthropicRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
