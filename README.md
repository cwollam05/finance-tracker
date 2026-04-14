# Finance Tracker

A full stack personal finance web app built with vanilla HTML, CSS, and JavaScript on the frontend and Supabase handling the backend. You can log your income and expenses, set a monthly budget, track your spending, and get AI powered insights on how your money is moving.

---

## What It Does

**Dashboard**
Shows your total income, total expenses, and net balance for the current month all in one place.

**Transaction Management**
Add income or expense transactions with a description, amount, category, and date. You can also delete any transaction and filter the list by category or type.

**Multi Currency Support**
When adding a transaction you can pick from 9 different currencies including EUR, GBP, JPY, CAD and more. The app automatically converts the amount to USD before saving it so everything stays consistent. Exchange rates come from the Frankfurter API and get cached for an hour so it is not making unnecessary requests every time you open the form.

**Monthly Budget**
Set a spending limit for the current month. A progress bar shows how much of your budget you have used and turns yellow when you hit 80% and red when you go over. Each month resets automatically.

**AI Spending Insights**
Click the Analyze button on the dashboard and Claude AI will read through your transactions for the month and give you 3 to 4 personalized insights about your spending. The response streams in word by word so you are not just staring at a loading spinner. Results get cached so if your transactions have not changed since the last time you clicked it, it just pulls from the cache instantly instead of calling the API again.

**Auth**
Sign up and log in with email and password through Supabase Auth. Email confirmation is turned on so you will get a verification email. Your data is locked to your account using row level security so no one else can see your transactions.

---

## APIs and Services Used

**Supabase**
Handles authentication, the database, and row level security. All transaction and budget data lives here. Free tier is more than enough for this project.

**Frankfurter API**
Free open exchange rate API with no key required. Used to convert foreign currency amounts to USD when logging a transaction. Rates are cached in localStorage with a one hour expiration.
Site: frankfurter.app

**Anthropic Claude API (claude haiku)**
Powers the AI spending insights feature. The request goes through a Vercel edge function that streams the Claude response back to the browser using server sent events. Claude haiku was chosen because it is fast and cheap while still being smart enough to give useful financial breakdowns.
Site: anthropic.com

**Vercel**
Hosts the frontend and runs the edge function at /api/insights that proxies the Anthropic streaming response. Deployment is automatic every time you push to GitHub.

---

## How to Run It Locally

You can open index.html directly in a browser but the AI insights button will not work locally because it needs the Vercel edge function. Everything else including auth, transactions, and budgets will work fine since those go straight to Supabase.

If you want insights to work locally you would need to run a local server that can handle the /api/insights route. The easiest way is to use the Vercel CLI.

**Step 1** Install the Vercel CLI

```
npm install -g vercel
```

**Step 2** Add your environment variable locally by creating a file called .env.local in the project root

```
ANTHROPIC_API_KEY=your_key_here
```

**Step 3** Run the dev server

```
vercel dev
```

Then open localhost:3000 and everything should work including the streaming AI insights.

---

## Environment Variables

These need to be set in your Vercel project under Settings > Environment Variables before deploying.

| Variable | What it is |
| --- | --- |
| ANTHROPIC_API_KEY | Your API key from console.anthropic.com |

The Supabase URL and anon key live directly in supabase.js since the anon key is safe to expose publicly. Supabase row level security policies make sure users can only access their own data regardless.

---

## Database Setup

If you are setting this up fresh you need to run these two SQL blocks in your Supabase SQL editor before the app will work.

**Transactions table**

```sql
create table transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('income','expense')),
  description text not null,
  amount      numeric(12,2) not null check (amount > 0),
  category_id text,
  date        date not null,
  created_at  timestamptz default now()
);

alter table transactions enable row level security;

create policy "Users manage own transactions"
  on transactions for all
  using (auth.uid() = user_id);
```

**Budgets table**

```sql
create table budgets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  month        date not null,
  limit_amount numeric(12,2) not null check (limit_amount > 0),
  created_at   timestamptz default now(),
  unique(user_id, month)
);

alter table budgets enable row level security;

create policy "Users manage own budgets"
  on budgets for all
  using (auth.uid() = user_id);
```

---

## Live Site

https://finance-tracker-dun-three-74.vercel.app
