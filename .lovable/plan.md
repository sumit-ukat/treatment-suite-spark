# Get the treatment-suite-spark repo running here

The repository's code is already present in this project — every file in the GitHub tree (docs, `src/app`, `src/domain`, `src/features`, `src/components`, `src/lib`, `supabase`) exists locally and matches. Nothing needs importing.

What is broken is the build: the app cannot compile or preview in Lovable, so the preview shows nothing useful. This plan fixes that so the app actually renders here.

## What will change

1. **Add the missing build script** — the platform runs `build:dev`, which this project doesn't define. Add it alongside the existing `build`.
2. **Fix the TypeScript config** — the newer compiler rejects `baseUrl`. Replace it with a relative `paths` mapping so `@/...` imports keep working, matching the alias already set in `vite.config.ts`.
3. **Make the dev server Lovable-friendly** — the `dev` script hardcodes port 3100 and the platform appends `--port 8080`; clean that up so there is one port and host binding.
4. **Backend connection** — the app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Without them the sign-in screen renders in its "not configured" state. I'll confirm the app boots to the sign-in screen, then we decide whether to point it at your existing backend or enable Lovable Cloud.

## Verification

After the fixes: run the typecheck and build, open the preview in a headless browser, and confirm the sign-in screen renders in both light and dark mode with no console errors.

## Note

Because this project is code-only right now, sign-in and all live data screens will stay empty until backend credentials are supplied. Say the word and I'll cover that in a follow-up step.
