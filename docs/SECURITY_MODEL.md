# Security Model

This system will hold client names, photographs, substance-misuse information, detox regimes,
safeguarding narratives and risk assessments. Under UK GDPR / Data Protection Act 2018 this is
**special category data** (health), for a population that is frequently vulnerable.

Nothing in this document constitutes a compliance claim. It describes controls; assurance is a
separate exercise by the organisation.

---

## 1. Threat model

| # | Threat | Primary control |
|---|---|---|
| T1 | Staff read clients at a centre they have no business seeing | Scope-based RLS; deny by default |
| T2 | A low-privilege role (helpdesk) reads safeguarding narratives | Sensitivity levels + column separation in RLS |
| T3 | UI restriction bypassed by calling the API directly | All rules in RLS/server functions; UI is convenience only |
| T4 | Client photograph leaks via a public URL | Private buckets; short-lived signed URLs; no public objects |
| T5 | Record altered to hide a missed obligation | Append-only audit; immutable `original_planned_discharge_date` |
| T6 | Audit log edited | `UPDATE`/`DELETE` revoked + trigger; no role can alter it |
| T7 | Sensitive text leaks into logs, errors or analytics | Level-3 fields excluded from logging; structured errors only |
| T8 | Temporary cover access persists after it should | Time-bounded assignments filtered in every policy |
| T9 | Leaked `service_role` key | Never in the browser; server-only; scoped usage; rotation |
| T10 | Real client data in fixtures, screenshots or git | `.gitignore`, fictional-data rule, review checklist |
| T11 | Two clients in one bed / cross-centre allocation | Database exclusion constraint + composite FK |
| T12 | Mass export of client data | Export is a permission, is audited, and is denied by default |

---

## 2. Access control

### Layers
1. **Postgres RLS** — the real boundary. Every sensitive table has policies; nothing relies on a
   `WHERE` clause the application remembered to add.
2. **`SECURITY DEFINER` server functions** — workflow rules (eligibility, approval separation,
   allocation) with explicit permission checks.
3. **Server-side route guards** — before data loads.
4. **UI** — hides what the user cannot use. **Assumed bypassable.**

### Scope resolution
A helper, marked `STABLE SECURITY DEFINER`, resolves the centres a user may see:

```sql
CREATE OR REPLACE FUNCTION app.accessible_centre_ids(p_permission text DEFAULT NULL)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT DISTINCT c.id
  FROM user_access_assignments a
  JOIN centres c
    ON (a.scope_type = 'centre'       AND c.id = a.scope_id)
    OR (a.scope_type = 'zone'         AND c.zone_id = a.scope_id)
    OR (a.scope_type = 'organisation' AND c.organisation_id = a.scope_id)
  WHERE a.user_id = auth.uid()
    AND a.revoked_at IS NULL
    AND now() >= a.starts_at
    AND now() <  coalesce(a.ends_at, 'infinity'::timestamptz)
    AND (p_permission IS NULL OR EXISTS (
          SELECT 1 FROM role_permissions rp
          JOIN permissions p ON p.id = rp.permission_id
          WHERE rp.role_id = a.role_id AND p.code = p_permission));
$$;
```

Temporary cover expires with no scheduled job: the `ends_at` predicate simply stops matching.

### Sensitivity in policy

Level-1 metadata and level-3 narrative live in the same row but are **not** returned together:

```sql
-- Everyone in scope sees that an alert exists, and how severe.
CREATE POLICY safeguarding_metadata_read ON safeguarding_records FOR SELECT
  USING (centre_id IN (SELECT app.accessible_centre_ids()));

-- Only the narrative-permitted may read the text — enforced by exposing
-- `summary` solely through a view that re-checks the permission.
CREATE VIEW safeguarding_narrative AS
  SELECT r.* FROM safeguarding_records r
  WHERE r.centre_id IN (SELECT app.accessible_centre_ids('safeguarding.read_narrative'));
```
Base-table `SELECT` is granted on the metadata columns only; `summary` is reachable only via the
view. A helpdesk JWT gets zero rows from it — not a blank field the client chose not to render.

**Because `accessible_centre_ids()` is called in every policy, it must be indexed and cached.**
Wrapping it in `(SELECT …)` lets Postgres evaluate it once per query rather than per row; this is a
correctness-preserving performance requirement, not an optimisation to defer.

### Deny by default
No assignment ⇒ no rows. No inheritance from seniority. `platform_admin` has almost no clinical read
(see [PERMISSIONS_MATRIX.md](PERMISSIONS_MATRIX.md)); granting oneself clinical access is itself an
audited row with a `granted_by`.

---

## 3. Keys and secrets

| Key | Where | Rule |
|---|---|---|
| `anon` / publishable | Browser | Safe only because RLS is correct. Never the sole control. |
| `service_role` | Server env only | **Bypasses RLS entirely.** Never in browser bundles, never in `VITE_*`, never in client-reachable code. Restricted to migrations and named server functions. |
| DB password | Local `.env.local` / host secret store | Not in git |

`.env*` files are git-ignored. A pre-merge check should fail the build if `service_role` appears in
any client bundle.

---

## 4. Storage

- Client photographs go in a **private** bucket. No public objects, ever.
- Access exclusively through **short-lived signed URLs** (target ≤ 60 s) minted server-side after a
  permission check.
- Storage policies mirror centre scope, so a URL cannot be minted for a client outside scope.
- Uploads validated for MIME type (`image/jpeg`, `image/png`, `image/webp`), magic bytes (not just
  the extension), and size (≤ 5 MB).
- Filenames are regenerated; the original is retained only as metadata. A client's name must never
  appear in a storage path.
- EXIF is stripped on upload — phone photographs commonly carry GPS coordinates, which would place
  the centre and the client.
- Replacement never deletes: the previous row is deactivated and retained.

---

## 5. Logging and observability

Application logs may contain: user id, centre id, record id, action, outcome, timing.
Application logs **must never** contain: client names, photographs, safeguarding or risk narratives,
therapy notes, detox or medical detail, substances, or any level-3 field.

The audit log has the same constraint. For level-3 tables it records *that* a record changed, by
whom, when — not the text. Otherwise `audit_events` becomes an unrestricted mirror of the
safeguarding notes readable by anyone with `audit.read`.

No third-party analytics or error-reporting SDK is added without a data-protection review; by default
none is included. No sensitive value in a URL, query string or page title.

---

## 6. Data minimisation

Only fields with a stated operational purpose are collected. `date_of_birth` is nullable and
**omitted unless justified** (Q — Round 3). No address, phone number, NHS number or next-of-kin
detail until a specific need is agreed. The workbook itself carries none of these; adding them
because they seem useful would expand the breach surface for no confirmed benefit.

---

## 7. Test and development data

- **Fictional data only.** Names generated, photographs synthetic or public-domain placeholders.
- The supplied workbook is **not** in the repository and is excluded by `.gitignore` (`*.xlsx`,
  `Whiteboard*`, `/private-data/`, extracted media).
- No real photograph in seeds, tests, screenshots or documentation.
- No real client name in commit messages, issues or docs.
- If real data is ever needed for import testing, it happens on a local machine against a local
  Supabase stack, and never leaves it.

---

## 8. Retention and deletion

- **Nothing is hard-deleted** by ordinary users. Archive/soft-delete only: client history, task
  history, allocation history and audit records persist.
- Retention periods are **not yet set** — Q29. Health and social-care records for substance-misuse
  services are commonly retained for several years post-discharge, but the period must come from the
  organisation's policy, not from us.
- Erasure requests (UK GDPR Art. 17) need a documented process. Note that erasure is frequently
  **restricted** where records are held for safeguarding or statutory purposes — this needs
  information-governance input, not an engineering decision.

---

## 9. Known limitations of this design

Stated plainly, because a security document that lists only controls is misleading.

1. **RLS correctness is the whole model.** A single mistaken policy exposes data broadly. Mitigation:
   per-role integration tests that execute real queries as each role's JWT (see
   [TEST_PLAN.md](TEST_PLAN.md)).
2. **`service_role` bypasses everything.** Any server function using it is outside RLS and must be
   individually reviewed.
3. **No field-level encryption.** Data is encrypted at rest by the platform and in transit, but a
   database compromise exposes narratives in plaintext.
4. **Audit completeness depends on trigger coverage.** A table added without its trigger is silently
   unaudited. Mitigation: a test that asserts every sensitive table has one.
5. **No MFA specified yet.** Strongly recommended for all staff and mandatory for admin roles;
   depends on Q30.
6. **No session-timeout policy yet.** Needed for shared devices in a residential setting — a logged-in
   tablet on a nurses' station is a realistic exposure.
7. **No rate limiting or brute-force protection** beyond Supabase defaults.
8. **Signed-URL lifetime is a trade-off.** Any positive lifetime means a copied URL works briefly.
9. **Screenshot and copy-paste exfiltration is not addressed** and largely cannot be.
10. **No penetration test or DPIA yet.** Both required before production.

---

## 10. Required before production

- [ ] Information-governance review and sign-off
- [ ] DPIA completed (Q33)
- [ ] Retention schedule agreed and implemented (Q29)
- [ ] Independent penetration test
- [ ] RLS policy review by someone other than the author
- [ ] MFA enforced; session-timeout policy set
- [ ] UK/EU data residency confirmed and configured **at Supabase project creation** — it cannot be
      changed later without a migration (Q31)
- [ ] Backup, restore **and a tested restore drill**
- [ ] Incident-response and breach-notification runbook (72-hour ICO obligation)
- [ ] Sub-processor list reviewed; Supabase DPA in place
- [ ] Confirmation that no real client data reached any non-production environment
