# TURATH Platform TODO

## Phase 1: Foundation
- [x] Global design system (colors, typography, CSS variables)
- [x] App layout structure and routing
- [x] Landing page (marketing, CTA, feature overview)
- [x] Auth flow (login, protected routes)

## Phase 2: Database Schema
- [x] projects table (config, prompts, schema, glossary, pipeline)
- [x] onboarding_samples table (image, manual transcription, isHeldOut)
- [x] documents table (filename, storage_path, status, project_id)
- [x] transcriptions table (raw_json, reviewed_json, original_text, model_used)
- [x] jobs table (background processing queue)
- [x] Run migrations

## Phase 3: tRPC Routers
- [x] projects router (CRUD, config update, stats)
- [x] onboarding router (upload samples, generate config, validate, refine, activate)
- [x] documents router (list, upload, transcribe, batchTranscribe)
- [x] transcriptions router (getByDocument, saveReview)
- [x] export router (CSV, JSON ZIP generation)
- [x] jobs router (list)
- [x] transcriptionEngine.ts (universal single-pass + two-pass)
- [x] onboardingAgent.ts (Meta-AI config generation, validation, refinement)

## Phase 4: Dashboard & Auth
- [x] Project dashboard (list projects, stats, progress)
- [x] Create project dialog
- [x] Project workspace layout (sidebar nav per project)

## Phase 5: Onboarding Wizard
- [x] Sample upload with drag-and-drop and image preview
- [x] Manual transcription JSON editor with live validation
- [x] Held-out sample selection
- [x] AI analysis loading screen
- [x] Validation diff view (field-by-field comparison)
- [x] Natural language refinement feedback loop
- [x] Project activation and redirect

## Phase 6: Transcription Engine & Upload
- [x] Universal transcription engine (single-pass + two-pass)
- [x] Bulk document upload UI with per-file status
- [x] Batch transcribe pending documents
- [x] Active configuration summary panel

## Phase 7: Review Interface
- [x] Dynamic schema-driven form renderer
- [x] Side-by-side image + form layout
- [x] Status workflow (needs_review → reviewed / flagged)
- [x] Review queue with status filter
- [x] Field type mapping (string, boolean, array/tags, long text)
- [x] Auto-advance to next document after save

## Phase 8: Export & Settings
- [x] CSV export (dynamic columns from schema)
- [x] JSON export
- [x] TEI-XML placeholder (coming soon)
- [x] Project settings page (edit prompt, schema, glossary, pipeline, model, temperature)

## Phase 9: Polish & Tests
- [x] 17 vitest unit tests passing (auth, authorization, input validation)
- [x] Zero TypeScript errors
- [x] Status badge utility classes
- [x] Empty states for all pages
- [x] Final checkpoint and delivery

## Future Enhancements
- [ ] TEI-XML export format
- [ ] Hijri-to-Gregorian date conversion post-processing rule
- [ ] Project member invitations and shared workspaces
- [ ] Real-time batch processing progress via WebSocket
- [ ] Document page/folio management (multi-page documents)
- [ ] Confidence score display per transcription field

## Bug Fixes & Improvements (Round 2)
- [x] Add GOOGLE_AI_API_KEY secret and wire transcription engine to use it directly
- [x] Expand model dropdown: Gemini 3.1 Pro Preview, Gemini 2.5 Pro (stable + preview), Gemini 2.5 Flash, Gemini 2.0 Flash, Gemini 1.5 Pro/Flash, GPT-4o, GPT-4o-mini, o4-mini
- [x] Onboarding: replace JSON editor with plain text textarea (auto-convert to JSON internally)
- [x] Fix review page 404 — docId param not passed through nested wouter route (fixed with useRoute)
- [x] Fix review page empty results — transcription data loading now correctly tied to resolved docId

## Bug Fixes & Improvements (Round 3)
- [x] Fix review page: transcription metadata not loading/displaying
- [x] Fix review page: verify document list, transcription fetch, and dynamic field rendering end-to-end
- [x] Add skip-onboarding button: marks project active, navigates to Settings

## Bug Fixes & Improvements (Round 4)
- [x] Fix review page navigation — error when switching between document cards
- [x] Fix Gemini 3.1 Pro API failure — removed (model not available on OpenAI-compat endpoint); using gemini-2.5-pro-preview-05-06 as top model
- [x] Simplify model dropdown — 8 essential models with friendly labels grouped by family
- [x] Fix batch transcription to fire all API calls in parallel (Promise.all, concurrency cap 3)
- [x] Harden onboarding agent — always generate JSON schema + glossary from plain-text transcriptions
- [x] Fix onboarding validation accuracy — fuzzy character-level similarity replaces strict JSON string compare
- [x] Onboarding validation UI — human-readable side-by-side diff with per-field similarity % badges
