-- 0013 · Task templates, one per whiteboard action column
--
-- STATUS: APPLIED to treatment-ops-dev (2026-08-04). 20 templates.
--
-- Organisation-scoped (centre_id null), so every centre inherits them until one needs its own
-- schedule. Q31 asks whether all centres share a schedule; until answered, shared is the safe
-- default because it is trivially overridden per centre and painful to consolidate later.
--
-- Three of these were missing from the product entirely until this migration: `side_assignment`
-- (workbook col R, never built), `detox_review` (col U, extracted then dropped) and
-- `doctor_assessment` (col AG, empty in the source but a named requirement).
--
-- Offsets marked below are inferred from the workbook, not confirmed. Each is a value in a row, so
-- an answer to Q11/Q12 changes data rather than code.

insert into task_templates
  (organisation_id, code, name, category, due_basis, due_offset, due_offset_unit,
   responsible_role_code, reschedule_on_discharge_change, requires_completion_note,
   visibility_level, sort_order, description)
select o.id, v.code, v.name, v.category, v.basis, v.off, v.unit, v.role, v.resched, v.note, v.vis, v.ord, v.descr
from organisations o
cross join (values
  -- Family contact — workbook cols I, J, K, L. Kept as four separate templates, never merged.
  ('family_contact_24h',          '24-hour family contact',           'family_contact','admission',        24,'hours','support_staff', false,false,1, 10,'Workbook col I'),
  ('family_contact_week_1',       'Week 1 family contact',            'family_contact','admission',         1,'weeks','support_staff', false,false,1, 20,'Workbook col J. Exact day unconfirmed - Q11'),
  ('family_contact_week_2',       'Week 2 family contact',            'family_contact','admission',         2,'weeks','support_staff', false,false,1, 30,'Workbook col K. Exact day unconfirmed - Q12'),
  ('family_contact_pre_discharge','Family contact 24h before leaving','family_contact','planned_discharge',-24,'hours','support_staff', true, true, 1, 40,'Workbook col L. Follows the discharge date when it moves'),
  -- Survey — col M
  ('satisfaction_survey_7day',    '7-day satisfaction survey',        'survey',        'admission',         7,'days', 'support_staff', false,false,1, 50,'Workbook col M'),
  -- Milestones — cols N, O, P, Q, R, S
  ('life_story',                  'Life story / surrender',           'milestone',     'admission',        10,'days', 'therapist',     false,false,2, 60,'Workbook col N'),
  ('step_1',                      'Step 1',                           'milestone',     'admission',        12,'days', 'therapist',     false,false,2, 70,'Workbook col O'),
  ('step_2',                      'Step 2',                           'milestone',     'admission',        18,'days', 'therapist',     false,false,2, 80,'Workbook col P'),
  ('step_3',                      'Step 3',                           'milestone',     'admission',        24,'days', 'therapist',     false,false,2, 90,'Workbook col Q'),
  ('side_assignment',             'Side assignment',                  'milestone',     'manual',            0,'days', 'therapist',     false,true, 2,100,'Workbook col R. Carries a TOPIC, not just a status, so a completion note is required. Meaning unconfirmed - Q4'),
  ('ccp',                         'CCP',                              'milestone',     'admission',        14,'days', 'therapist',     false,false,2,110,'Workbook col S. Meaning unconfirmed - Q2'),
  -- Weekly sessions — cols W, X, Y, Z, AA
  ('session_intro',               'Intro CP/121',                     'session',       'admission',         0,'days', 'therapist',     false,false,2,120,'Workbook col W. Meaning of CP/121 unconfirmed - Q3'),
  ('session_week_1',              'Week 1 CP/121',                    'session',       'admission',         1,'weeks','therapist',     false,false,2,130,'Workbook col X'),
  ('session_week_2',              'Week 2 CP/121',                    'session',       'admission',         2,'weeks','therapist',     false,false,2,140,'Workbook col Y'),
  ('session_week_3',              'Week 3 CP/121',                    'session',       'admission',         3,'weeks','therapist',     false,false,2,150,'Workbook col Z'),
  ('session_week_4',              'Week 4 CP/121',                    'session',       'admission',         4,'weeks','therapist',     false,false,2,160,'Workbook col AA'),
  -- Medical and detox — cols AE, U, AG
  ('gp_summary',                  'GP summary',                       'medical',       'admission',         5,'days', 'centre_manager',false,false,3,170,'Workbook col AE'),
  ('detox_review',                'Detox completion / review',        'detox',         'manual',            0,'days', 'centre_manager',false,true, 3,180,'Workbook col U. Previously dropped from the product entirely'),
  ('doctor_assessment',           'Doctor assessment',                'medical',       'manual',            0,'days', 'centre_manager',false,true, 3,190,'Workbook col AG. Empty in source. Review weekday is per-centre config, never hard-coded'),
  -- Required by the brief, not present as a workbook column
  ('discharge_prep',              'Discharge preparation',            'discharge',     'planned_discharge',-3,'days', 'centre_manager',true, false,1,200,'Brief section 12')
) as v(code,name,category,basis,off,unit,role,resched,note,vis,ord,descr)
where o.slug = 'ukat'
on conflict (organisation_id, centre_id, code) do nothing;
