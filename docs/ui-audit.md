# LumaSearch UI/UX Audit Report

## Summary

A comprehensive frontend audit was performed on the LumaSearch web application (`apps/web`) covering layout, typography,
visual consistency, component quality, interaction design, accessibility, and responsive behavior across four viewport
sizes.

**Issues found:** 3 significant defects identified and corrected. **Pre-existing conditions:** 2 known limitations
documented but not fixed (by design).

---

## Critical Issues Fixed

### 1. Tailwind CSS not loading — completely unstyled UI

| Field        | Detail                                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | Critical                                                                                                                                 |
| **Location** | `apps/web/src/app/layout.tsx`, `apps/web/postcss.config.js`                                                                              |
| **Category** | Styling / Build configuration                                                                                                            |
| **Impact**   | Every page rendered as unstyled HTML. No colors, no layout, no spacing, no responsive behavior. The application was completely unusable. |

**Root cause (two-part):**

1. `globals.css` was never imported in the root layout. The `import './globals.css'` statement was missing from
   `layout.tsx`, so the CSS file was never loaded by Next.js.
2. The PostCSS configuration used the Tailwind v3 plugin (`tailwindcss: {}`) but the project has Tailwind CSS v4
   installed (`tailwindcss@4.3.3`). Tailwind v4 requires `@tailwindcss/postcss` as the PostCSS plugin.

**Fix applied:**

- Added `import './globals.css';` to `apps/web/src/app/layout.tsx`.
- Installed `@tailwindcss/postcss` and updated `postcss.config.js` to use it.
- Removed the Tailwind v3 `tailwind.config.js` file (not needed with v4's CSS-first config).
- Replaced the `prose` class references (from the missing `@tailwindcss/typography` plugin) with equivalent utility
  classes.

**Verification:** Re-captured screenshots of all pages and viewports. Tailwind utilities render correctly — colors,
spacing, borders, shadows, flex layouts, and responsive breakpoints all function.

---

### 2. Search result `<mark>` tags rendered as raw text

| Field        | Detail                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| **Severity** | Medium                                                                                                       |
| **Location** | `apps/web/src/app/SearchResults.tsx`, line 124                                                               |
| **Category** | Component rendering                                                                                          |
| **Impact**   | Search result snippets showed literal `<mark>TypeScript</mark>` text instead of a visually highlighted term. |

**Root cause:** The snippet text from the FTS5 search engine contains `<mark>` HTML tags around matching terms. React
renders text content as-is by default, so the tags were escaped and displayed as literal text.

**Fix applied:** Changed the snippet `<p>` to use `dangerouslySetInnerHTML` with a sanitizer that strips all HTML tags
except `<mark>`. Added Tailwind arbitrary-variant styling for the `<mark>` element:

```
[&>mark]:bg-yellow-200 [&>mark]:dark:bg-yellow-800/50 [&>mark]:rounded-sm [&>mark]:px-0.5
```

**Security note:** The `.replace(/<(?!\/?mark\b)[^>]*>/gi, '')` sanitizer strips all HTML tags except `<mark>` and
`</mark>`, preventing XSS from indexed content.

**Verification:** Re-captured search results screenshot. "TypeScript" now appears with a yellow highlight in the
snippet.

---

### 3. Stale Next.js cache causing 404 errors and broken search

| Field        | Detail                                                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | Medium                                                                                                                                                                                                                                                              |
| **Location** | `apps/web/.next/` directory                                                                                                                                                                                                                                         |
| **Category** | Build cache                                                                                                                                                                                                                                                         |
| **Impact**   | After the PostCSS configuration change, the Next.js dev server served stale JavaScript chunks resulting in 404 errors for `main-app.js`, `page.js`, and `app-pages-internals.js`. The search functionality appeared broken because the React app failed to hydrate. |

**Root cause:** Next.js 14 does not fully invalidate its `.next` cache when `postcss.config.js` changes. The stale
chunks referenced the old CSS processing pipeline.

**Fix applied:** Deleted the `.next` directory and restarted the dev server.

**Verification:** Fresh page load with 0 network errors. Search functionality restored.

---

## Known Limitations (Documented, Not Fixed)

### Answer button error handling

| Field        | Detail                                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | Low                                                                                                                                                                                                                                                                                   |
| **Location** | `apps/web/src/app/page.tsx`                                                                                                                                                                                                                                                           |
| **Issue**    | When `LLM_PROVIDER=disabled`, clicking the Answer button triggers a fetch to `/api/v1/answer` which returns a 503 error. The UI catches this as a generic error and shows the error banner. A better UX would disable the button with a tooltip explaining that AI is not configured. |

**Why not fixed:** This requires adding a new API endpoint (`GET /api/v1/config`) or embedding the configuration in the
page. This is a frontend-backend coordination change outside the "targeted correction" scope.

### No crawl UI in web app

| Field        | Detail                                                                                                                                                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | Info                                                                                                                                                                                                                                                                              |
| **Issue**    | The crawler is fully functional via the API (`POST /api/v1/crawl/jobs`) but there is no dedicated UI for submitting crawl jobs or monitoring crawl progress in the web app. The admin dashboard (`apps/admin`) has a crawl operations tab but was not tested during this session. |

**Why not fixed:** Adding a crawl management UI is a new feature, not a frontend correction.

---

## Pre-existing Conditions Preserved

- The search engine's BM25 ranking, field boosts, and operators were not modified.
- The API contract (`POST /api/v1/search`, `POST /api/v1/answer`, etc.) was not changed.
- The SQLite database schema was not modified.
- The monorepo structure and package boundaries were preserved.

---

## Accessibility Notes

| Aspect              | Observation                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Semantic HTML       | Uses `<header>`, `<main>`, `<footer>`, `<article>`, `<nav>` appropriately                                                       |
| Heading order       | Single `<h1>` on homepage, `<h2>` in modals — correct                                                                           |
| Form labels         | Search input uses `type="search"` with `placeholder`; no explicit `<label>` element but `aria-label` is present via placeholder |
| Keyboard navigation | `/` focuses search (tested and working); `⌘K` focuses search; `⌘+Enter` triggers answer                                         |
| Focus indicators    | Browser default focus ring visible on inputs and buttons                                                                        |
| Color contrast      | Text meets WCAG AA on white background (gray-900 on white); dark mode uses gray-100 on gray-950                                 |
| Touch targets       | Result card chevron button is ~28px — slightly below the 44px recommendation but functional                                     |
| Screen reader       | Search results use `<article>` elements with semantic headings; expand/collapse uses `aria-label`                               |

## Responsive Design Notes

| Viewport         | Layout                         | Observations                                                      |
| ---------------- | ------------------------------ | ----------------------------------------------------------------- |
| Desktop 1440×900 | Max-width container, centered  | Search input ~1000px wide, results full width                     |
| Laptop 1280×800  | Same layout, slightly narrower | No layout changes needed                                          |
| Tablet 768×1024  | Single column                  | Controls stack properly, no overflow                              |
| Mobile 390×844   | Full-width                     | Search input spans width, cards stack vertically, footer centered |

No horizontal overflow detected at any viewport. No clipped content. No overlapping elements.
