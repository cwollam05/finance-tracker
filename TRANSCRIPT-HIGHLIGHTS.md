# Development Highlights

A summary of key moments from building the Finance Tracker app.

---

## 1. Designing the Data Model
Before writing a single line of UI code, I mapped out the full database structure for `profiles`, `transactions`, and `categories`. Understanding how these tables relate to each other — and why Row Level Security matters — gave me a solid foundation to build on rather than having to restructure the database later.

## 2. Going from a Static Layout to a Live Full-Stack App
The app started as empty HTML, CSS, and JS files. Seeing it evolve from a visual mockup with mock login logic into a real app connected to Supabase — where signups, logins, and transactions are all stored in an actual database — was the biggest leap of the project.

## 3. Adding the Monthly Budget Feature
The budget limit was the most functional addition beyond basic CRUD. Setting a spending cap per month and watching the progress bar shift from green to amber to red as expenses were logged made the app feel like a real personal finance tool rather than just a transaction list.

## 4. Deploying to Vercel and Fixing the Live App
Deploying surfaced a real-world issue I wouldn't have caught locally — Supabase's email confirmation was redirecting to localhost instead of the live site. Knowing to update the redirect URL in Supabase's dashboard, and then following up with mobile CSS fixes after testing on an actual device, gave me a taste of what post-deployment iteration looks like in practice.
