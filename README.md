# D. L. K News

D. L. K is a Malawi-first, global news and public-information platform. It is designed for fast, sourced coverage of breaking news, country desks, conflict updates, crime, investigations, and public leaders.

## Principles

1. Every story displays its source, publication time, and verification state.
2. Public-figure profiles use public, sourced information only.
3. News is evidence, not rumor. Unverified claims are clearly labeled.
4. The public website remains fast and mobile-first.

## Foundation

The initial foundation uses Next.js static export, a Material 3-inspired interface, Base44 backend functions, and GitHub Pages deployment. The first milestone is a real feed pipeline, category navigation, search, story detail pages, country desks, and source-aware caching.

## Local development

```bash
npm install
npm run dev
```

## Planned backend

`base44/functions/newsFeed.ts` will aggregate approved RSS sources server-side, normalize stories, deduplicate them, and cache results. Provider keys and ingestion credentials must remain backend-only.
