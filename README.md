# FlyRate Exchange

Production-ready marketing site + calculator for FlyRate Exchange, built with
Next.js 14 (App Router), TypeScript, Tailwind CSS, and Framer Motion.

## What's included

- **Home page** — hero, live rate ticker, rates table, calculator, why-choose
  cards, how-it-works, reviews carousel, FAQ, contact.
- **Currency calculator** — picks valid corridors automatically, computes the
  recipient amount, and opens WhatsApp with a pre-filled order message.
- **`/admin`** — password-protected (via Firebase Auth) page to update buy/sell
  rates without touching code or redeploying.
- **Firestore fallback** — the site works immediately using the placeholder
  rates in `data/rates.seed.json`, even before Firebase is set up. Once
  Firebase env vars are added, it reads/writes live rates from Firestore
  instead.

## 1. Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. It will run fine with placeholder rates even with
no `.env.local` file.

## 2. Set your real exchange rates

**Fastest option (no Firebase needed):** edit `data/rates.seed.json` directly
and redeploy. Good if you're the only one updating rates and don't mind a
30-second redeploy each time.

**Recommended option (update from your phone, no redeploy):** wire up
Firebase so `/admin` works:

1. Go to https://console.firebase.google.com → Create project.
2. Build → Firestore Database → Create database (start in production mode).
3. Build → Authentication → Sign-in method → enable **Email/Password**.
4. Authentication → Users → Add user → create yourself an admin login.
5. Project settings → General → scroll to "Your apps" → Add app → Web.
   Copy the config values into `.env.local` (copy `.env.example` first).
6. Firestore → Rules → paste the contents of `firestore.rules` in this repo
   → Publish.
7. Redeploy (or just refresh if running locally). Visit `/admin`, sign in,
   and enter your real buy/sell rate for each corridor.

The public site always reads whatever is in Firestore, and falls back to the
seed file if a corridor is missing or Firestore is unreachable.

## 3. Update your brand details

- **WhatsApp number**: `lib/whatsapp.ts` → `WHATSAPP_NUMBER` (currently
  `97451131080`, international format, no `+` or spaces).
- **Email / hours**: `components/Contact.tsx`.
- **Reviews**: `components/Reviews.tsx` — swap in real testimonials once you
  have them.
- **Colors/fonts**: `tailwind.config.ts` (brand tokens) and the Google Fonts
  `<link>` in `app/layout.tsx`.

## 4. Deploy (Vercel — recommended for Next.js)

1. Push this folder to a new GitHub repo.
2. Go to https://vercel.com → **Add New → Project** → import the repo.
   Vercel auto-detects Next.js; no config needed.
3. Under **Environment Variables**, add the six `NEXT_PUBLIC_FIREBASE_*`
   values from your `.env.local` (skip this if you're using the JSON-file
   approach instead of Firebase).
4. Click **Deploy**. You'll get a `*.vercel.app` URL immediately; add your own
   domain under Project → Settings → Domains once you're ready.

Every future `git push` to `main` redeploys automatically.

### Alternative: Firebase Hosting

If you'd rather keep everything inside one Firebase project:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # choose "Use an existing project", set public dir
                         # per Next.js static export docs, or use
                         # `firebase-frameworks` experimental Next.js support
firebase deploy
```

Vercel is the simpler path for a Next.js app like this one — no static-export
tradeoffs, and it's free at this scale.

## Notes

- The rates in `data/rates.seed.json` are **placeholders** — replace them
  with real figures before launch (see step 2).
- No separate transfer fee is modeled (`FEE_PERCENT = 0` in
  `components/Calculator.tsx`) — the buy/sell spread is the margin. Change
  that constant if you introduce a flat fee later.
