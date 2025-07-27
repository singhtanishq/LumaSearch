# LumaSearch Screenshot Index

All screenshots captured from the running local application at `http://localhost:3000`.

## Overview

### Homepage — Desktop (1440×900)

![Homepage — desktop](screenshots/01-overview/home-desktop.png)

The primary search interface with ranking profile selector, Answer button, search input, and empty-state hints.

### Homepage — Laptop (1280×800)

![Homepage — laptop](screenshots/01-overview/home-laptop.png)

Compact desktop layout. The search input and controls remain fully accessible.

### Homepage — Tablet (768×1024)

![Homepage — tablet](screenshots/01-overview/home-tablet.png)

Tablet layout. The single-column layout adapts naturally.

### Homepage — Mobile (390×844)

![Homepage — mobile](screenshots/01-overview/home-mobile.png)

Mobile layout. The search input spans the full width; the Answer button and profile selector stack above.

---

## Search Interface

### Empty State

![Empty state](screenshots/02-search/search-empty-state.png)

The default view before any search is submitted. Shows usage hints and keyboard shortcuts.

### Search Results — "typescript"

![Search results — typescript](screenshots/02-search/search-results-typescript.png)

Results for the query "typescript" with BM25-scored result card showing title, domain badge, source tag, date metadata,
and highlighted snippet.

### Search with `site:` Operator

![Search results — site operator](screenshots/02-search/search-results-site-operator.png)

Results filtered to `wikipedia.org` domain using the `site:` search operator.

### Search with Exclusion

![Search results — exclusion](screenshots/02-search/search-results-exclusion.png)

Results for "programming -python" demonstrating the `-` exclusion operator.

### Search with "Fastest" Profile

![Search results — fastest profile](screenshots/02-search/search-results-profile-fastest.png)

Results after switching the ranking profile to "Fastest (BM25 only)".

### No Results State

![No results](screenshots/02-search/search-no-results.png)

The interface when a query returns zero results.

---

## Result Cards

### Result Card Detail

![Result card](screenshots/03-results/search-result-cards.png)

A single result card with expandable metadata section showing ID, language, and score.

---

## Responsive Layouts

### Search Results — Laptop (1280×800)

![Results — laptop](screenshots/05-responsive/search-results-laptop.png)

Search results at compact desktop width.

### Search Results — Tablet (768×1024)

![Results — tablet](screenshots/05-responsive/search-results-tablet.png)

Search results at tablet width.

### Search Results — Mobile (390×844)

![Results — mobile](screenshots/05-responsive/search-results-mobile.png)

Search results at mobile width. Cards stack in a single column with touch-friendly targets.
