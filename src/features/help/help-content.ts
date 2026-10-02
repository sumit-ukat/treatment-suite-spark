/**
 * The user guide, as data.
 *
 * Written for someone who has never used the tool and does not know the jargon — every article
 * answers one question a real member of staff would actually ask, in the words they would ask it.
 * Kept as plain data rather than JSX so the whole thing is searchable: HelpCentre builds one
 * lowercase haystack per article from the title, the keywords and every line of the body, which is
 * why a search for "who can approve" finds the discharge article even though those words appear
 * only in a step.
 *
 * Accuracy matters more than completeness here. Everything below was checked against the screens it
 * describes; where the tool cannot yet do something, the article says so rather than describing an
 * intention.
 */

export type HelpBlock =
  | { kind: 'p'; text: string }
  | { kind: 'steps'; items: readonly string[] }
  | { kind: 'bullets'; items: readonly string[] }
  | { kind: 'note'; text: string }
  | { kind: 'warn'; text: string }
  | { kind: 'table'; head: readonly string[]; rows: ReadonlyArray<readonly string[]> };

export interface HelpArticle {
  id: string;
  category: CategoryId;
  /** Phrased as the question a user would ask. */
  title: string;
  /** One line shown under the title in the collapsed state. */
  summary: string;
  /** Extra search terms — synonyms and the words people use that the article itself does not. */
  keywords: readonly string[];
  body: readonly HelpBlock[];
  /** Path to an annotated screenshot, relative to /public. Shown as an expandable image. */
  screenshot?: string;
}

export type CategoryId =
  | 'start'
  | 'roomboard'
  | 'treatmentboard'
  | 'clients'
  | 'admissions'
  | 'leaving'
  | 'concerns'
  | 'oversight'
  | 'admin'
  | 'glossary';

export const CATEGORIES: ReadonlyArray<{ id: CategoryId; label: string; blurb: string }> = [
  { id: 'start',          label: 'Getting started',   blurb: 'What this tool is, the full journey it covers, and how to move around it' },
  { id: 'roomboard',      label: 'Room board & GP Summary', blurb: 'Who is in which bed, right now, and the GP summary log' },
  { id: 'treatmentboard', label: 'Treatment board',   blurb: 'Every required category for every client, and the Status flag' },
  { id: 'clients',        label: 'Clients',           blurb: 'Finding people, reading their file, and the directory’s activity cards' },
  { id: 'admissions',     label: 'Admissions',        blurb: 'Bringing someone into treatment' },
  { id: 'leaving',        label: 'Graduating & leaving', blurb: 'Graduation, discharge, transfer and extensions' },
  { id: 'concerns',       label: 'Concerns & incidents', blurb: 'Raising something that needs attention' },
  { id: 'oversight',      label: 'Reports & oversight', blurb: 'Overview, group hub and the activity log' },
  { id: 'admin',          label: 'Administration',    blurb: 'Staff, access levels, rooms and beds' },
  { id: 'glossary',       label: 'Words & symbols',   blurb: 'What the terms and icons mean' },
];

export const ARTICLES: readonly HelpArticle[] = [
  /* ───────────────────────── Getting started ───────────────────────── */
  {
    id: 'walkthrough-full-journey',
    category: 'start',
    title: 'What does a client’s whole journey through this tool look like, start to finish?',
    summary: 'One walkthrough: admission, day-to-day treatment, and however it ends — graduation, early discharge, transfer, or extension.',
    keywords: ['walkthrough', 'journey', 'whole process', 'full process', 'start to finish', 'from admission to discharge', 'end to end', 'how it all works', 'lifecycle', 'overview of the process', 'step by step'],
    body: [
      { kind: 'p', text: 'This is the one article to read before any other. Every other article in this guide is a detail of one of the stages below — bookmark this one and come back to it whenever you lose track of where something fits.' },
      { kind: 'p', text: 'Stage 1 — Admission. Someone arrives.' },
      { kind: 'steps', items: [
        'An admitting staff member opens "Admissions" and fills in the client’s details, the bed they are going into, their care team (therapist, buddy), and which programme modules apply to them.',
        'They tick which side assignments (extra, client-specific tasks) are needed, record any safeguarding information, and optionally upload a photograph.',
        'They check the review screen — which repeats everything back before anything is saved — and confirm.',
        'The system creates the client’s full task list automatically, from templates, based on the modules ticked. Nothing is typed in by hand.',
      ] },
      { kind: 'p', text: 'Stage 2 — Day to day. The client is in treatment.' },
      { kind: 'bullets', items: [
        'The Room board shows them as an occupied bed card: photo, day of treatment, planned discharge date, therapist, and an overall status colour.',
        'The Treatment board shows them as one row, with a column per category (Admin, GP Summary, Contact/Comms, 7 Day Satisfaction, Family Visit, Life Story/Step Work, Care Plan, Doctor – Thursday, Side assignment). Clicking a category cell opens the real tasks inside it, where staff tick them off as they are done.',
        'A GP summary is due within 3 days of admission — tracked automatically from the admission date.',
        'Staff can set a quick Status flag (Graduate, Discharged, Extended, Transferred, or Not set) at any point from the Treatment board, Room board, or the client’s file — this is a manual heads-up marker, separate from and independent of the formal leaving process below. See "What is the Status column, and how is it different from Discharge?".',
        'If something needs flagging, staff log a concern (an informal worry, shown as an amber stripe) or file a formal incident report, as appropriate.',
        'If the stay needs to run longer than planned, staff submit a stay extension for approval.',
      ] },
      { kind: 'p', text: 'Stage 3 — Leaving. Treatment ends, one of four ways.' },
      { kind: 'table', head: ['How it ends', 'What staff pick', 'What happens next'], rows: [
        ['Graduation (planned)', 'Type: "Planned (Graduated)". The reason is fixed — "Completed Treatment" — nothing else to choose.', 'Discharges immediately once the date and any report details are entered. No approval step, since nothing is being flagged as a concern.'],
        ['Early discharge', 'Type: "Early discharge", then Reason (Self Discharged, or Medical / Treatment Discharged) and a Sub Reason from that reason’s own list — see "How do I record an early discharge?" for the full lists.', 'Needs sign-off from a different person before it is finalised. The reason/sub reason are captured at the request step and carried through automatically.'],
        ['Transfer', 'Type: "Transfer", then Reason (which clinic — the group’s own centre list, current centre left out) and Sub Reason (why — a fixed list of 3).', 'Also needs sign-off from a different person. Destination, treatment type and expected duration are captured too.'],
        ['Other', 'Type: "Other", with a free-text reason.', 'Also needs sign-off from a different person, for anything the three types above do not cover.'],
      ] },
      { kind: 'p', text: 'Whichever way it ends, the same three-permission discipline applies for anything other than a planned graduation: one person initiates the request, a different person approves it, and someone with the finalise permission completes it — so no single person can move a client out of a bed unchecked. Once finalised, the bed is free and the client’s full record — admission, every task, and how it ended — stays visible forever in their client file, the Discharge page, and the Activity log.' },
      { kind: 'note', text: 'Nothing about this process is hidden in one screen. The Discharge page (left menu) gives a live, filterable view of who is leaving today, who is due this week or later, and the full history of everyone who already has — see "What is the Discharge page for?".' },
    ],
  },
  {
    id: 'what-is-this',
    category: 'start',
    title: 'What is Treatment Ops?',
    summary: 'One place to see who is in treatment, what they need, and whether it has been done.',
    keywords: ['intro', 'introduction', 'purpose', 'overview', 'what does this do', 'new user', 'first time', 'beginner'],
    body: [
      { kind: 'p', text: 'Treatment Ops keeps track of everyone currently in treatment across the UKAT group, and every task that has to happen for each of them. Instead of a whiteboard on a wall and a spreadsheet on somebody’s laptop, it is one shared, always-current picture.' },
      { kind: 'p', text: 'There are two levels. The group hub shows all centres at once — useful for managers and directors. Inside a centre you get the day-to-day screens: who is in which bed, what is due today, who is graduating this week.' },
      { kind: 'bullets', items: [
        'Nothing is hidden behind a report you have to request — the current state is always on screen.',
        'Everything you change is recorded, with your name and the time, in the Activity log.',
        'What you can see and do depends on your access level. If a button is missing, that is why.',
      ] },
      { kind: 'note', text: 'You cannot break anything by looking. Clicking around to learn the tool is safe — the only actions that change data are ones with a clear button like Save, Complete or Approve.' },
    ],
  },
  {
    id: 'finding-your-way',
    category: 'start',
    title: 'How do I find my way around?',
    summary: 'The menu down the left is your map. Here is what each item is for.',
    keywords: ['navigation', 'menu', 'sidebar', 'left hand side', 'where is', 'lost', 'get around', 'links'],
    body: [
      { kind: 'p', text: 'The dark menu down the left is the navigation rail. It only appears once you are inside a centre, because none of these screens make sense for ten centres at once.' },
      { kind: 'table', head: ['Menu item', 'What it is for'], rows: [
        ['Overview',         'The centre at a glance — headline numbers and anything needing attention.'],
        ['Treatment board',  'A compact grid: every client down the side, every required category across the top. Click a category to see its real tasks.'],
        ['Room board',       'Every bed in the building and who is in it.'],
        ['GP Summary',       'A live log of every client’s GP summary — surgery contact, when the request was sent and received, and sign-off.'],
        ['Discharge',        'Who is leaving today, who is due this week or later, and the full history of everyone who already has.'],
        ['Clients',          'Search for anyone who has ever stayed here, past or present, with a quick activity snapshot.'],
        ['Admissions',       'Bring a new client into treatment.'],
        ['Activity log',     'Who changed what, and when.'],
        ['Administration',   'Staff, access levels, rooms and beds.'],
        ['Back to group hub','Leave this centre and see all centres.'],
      ] },
      { kind: 'note', text: 'The arrow at the very bottom of the menu collapses it to icons only, which gives you more room on a small screen. Click it again to bring the words back.' },
      { kind: 'warn', text: 'Incident reports exist as a feature (ask an administrator for the direct link) but are not currently a left-menu item at every centre — if you expect to see one and do not, that is a configuration choice, not something missing from your account.' },
    ],
  },
  {
    id: 'switch-centre',
    category: 'start',
    title: 'How do I switch to a different centre?',
    summary: 'Use the centre name at the top right, or go back to the group hub and pick one.',
    keywords: ['change centre', 'another centre', 'other site', 'move between', 'centre picker', 'location'],
    body: [
      { kind: 'steps', items: [
        'Look at the top right of the screen for the centre name in a box — for example "Primrose Lodge".',
        'Click it and choose a different centre from the list.',
        'Alternatively, click "Back to group hub" at the bottom of the left menu, then click any centre in the list.',
      ] },
      { kind: 'note', text: 'You will only see centres you have been given access to. If a centre you expect is missing, ask an administrator to add you — see "What are the 5 access levels and what can each one do?".' },
    ],
  },
  {
    id: 'permissions-why-missing',
    category: 'start',
    title: 'Why can’t I see a button other people can see?',
    summary: 'Your access level decides what you can do. Missing buttons are a permission, not a bug.',
    keywords: ['permission', 'access', 'role', 'cannot', 'can’t', 'button missing', 'greyed out', 'not allowed', 'denied', 'blocked'],
    body: [
      { kind: 'p', text: 'Every action in the tool is tied to a named permission, and every person is given a set of them through their access level. If you do not hold the permission, the button is not shown at all — rather than shown and then refusing to work.' },
      { kind: 'p', text: 'Common examples:' },
      { kind: 'bullets', items: [
        'You can see a client’s reference number but not their name — your level does not include "view identity".',
        'You can see tasks but cannot tick them off — your level does not include "complete tasks".',
        'You can start a discharge but not approve one — approval is deliberately a separate permission from initiating.',
        'The Administration screen is missing entirely — that needs "manage users", held only by Super Admin.',
      ] },
      { kind: 'note', text: 'If you need a permission you do not have, ask your centre manager or someone with Super Admin access. They can change it under Administration → User Management. See the next article for what each of the 5 levels actually covers.' },
    ],
  },
  {
    id: 'roles-explained',
    category: 'start',
    title: 'What are the 5 access levels and what can each one do?',
    summary: 'Super Admin, Operations Manager, Centre Manager, Clinical Staff, and View Only — from everything, to one centre, to view-only.',
    keywords: ['roles', 'access levels', 'super admin', 'operations manager', 'centre manager', 'clinical staff', 'therapist', 'view only', 'centre staff', 'permissions list', 'who can do what', 'what can i do'],
    body: [
      { kind: 'p', text: 'Every person with a login holds exactly one of these 5 access levels, at whichever centre(s) or scope they were granted it. They are ordered here from most to least access.' },
      { kind: 'table', head: ['Level', 'Scope', 'Can do', 'Cannot do'], rows: [
        ['Super Admin', 'Every centre', 'Every permission in the system — including managing other staff’s access and creating/configuring centres.', 'Nothing — this is full access.'],
        ['Operations Manager', 'Every centre', 'Oversight and approval group-wide: sign off discharges and stay extensions, view reports, audit history, and operational detail at every centre.', 'Managing other staff’s access, creating/configuring centres, admitting clients, room/bed management, or any hands-on clinical recording.'],
        ['Centre Manager', 'One centre (or a set of centres)', 'Full control at that centre: admissions, discharge, stay extensions, room/bed management, all clinical recording (treatment, medical, risk, safeguarding), client identity editing, reports, audit history.', 'Managing other staff’s access, or creating/configuring centres.'],
        ['Clinical Staff', 'One centre', 'The clinical work: view and complete assigned tasks, record treatment sessions and family contact, see client details and photos.', 'Admitting, discharging or extending a stay; room/bed management; editing client identity; recording or reading risk/safeguarding/medical detail.'],
        ['View Only', 'One centre', 'See which beds/rooms are occupied or free, the task list, and client names and basic facts.', 'Any clinical, risk or safeguarding detail; completing tasks or recording anything clinical; admissions, discharge or room management.'],
      ] },
      { kind: 'p', text: 'Clinical Staff is the broad level for anyone doing hands-on treatment work — therapists, support workers, and similar roles, not only people with "therapist" in their job title. View Only suits maintenance, reception, or anyone who needs to know who is where without touching clinical records.' },
      { kind: 'note', text: 'An administrator sets this up from Administration → User Management, where the same 5 levels are shown as cards with a "Show details" toggle for this exact breakdown. See "How do I manage staff and their access?".' },
    ],
  },

  /* ───────────────────────── Room board & GP Summary ───────────────────────── */
  {
    id: 'roomboard-what',
    category: 'roomboard',
    title: 'What does the Room board show me?',
    summary: 'Every bed in the centre, whether it is filled, and how that client is doing.',
    keywords: ['beds', 'rooms', 'who is in', 'occupancy', 'free beds', 'available', 'cards'],
    body: [
      { kind: 'p', text: 'The Room board is one card per bed. A filled bed shows the client in it; an empty bed shows a dashed blue card saying "Available".' },
      { kind: 'p', text: 'Use it when you need to know where somebody is, whether you have a bed free, or who needs attention today.' },
      { kind: 'note', text: 'A bed marked "shared" is one of two beds in the same room.' },
    ],
    screenshot: '/help-screenshots/room-board.png',
  },
  {
    id: 'roomboard-read-card',
    category: 'roomboard',
    title: 'How do I read a bed card?',
    summary: 'Photo, name, day of treatment, discharge date, therapist, progress bar, Status chip, status line.',
    keywords: ['card', 'bed card', 'understand', 'meaning', 'day of', 'progress bar', 'therapist', 'initials', 'status chip'],
    body: [
      { kind: 'p', text: 'Reading a filled bed card from the top down:' },
      { kind: 'table', head: ['What you see', 'What it means'], rows: [
        ['Photo or initials',    'Their photograph if one has been uploaded, otherwise their initials. A red "?" corner means no photo is on file.'],
        ['Bed number',           'Which bed this is. "shared" beside it means two beds in that room.'],
        ['Coloured dot',         'Overall status — green on track, amber due soon, red needs attention.'],
        ['Name and reference',   'Their name (if you may see names) and their client reference.'],
        ['Day',                  'Which day of treatment they are on, out of their planned length.'],
        ['Discharge',            'The planned date they are due to leave.'],
        ['Therapist',            'Who is assigned. Amber "None" means nobody is.'],
        ['Progress bar',         'How much of their required task list is complete.'],
        ['Status chip',          'The manually-set Status flag (Graduate, Discharged, Extended, Transferred), when one has been chosen. See "What is the Status column, and how is it different from Discharge?".'],
        ['Status line',          'Red for overdue, amber for due today, green for on track.'],
      ] },
      { kind: 'note', text: 'A red number in a circle at the top-right corner of a card counts everything needing attention for that client, so you can spot the busy ones without reading each card.' },
    ],
  },
  {
    id: 'roomboard-colours',
    category: 'roomboard',
    title: 'What do the colours and coloured card edges mean?',
    summary: 'Red means act now, amber means soon, green means fine, blue means the bed is free.',
    keywords: ['colour', 'color', 'red', 'amber', 'orange', 'green', 'blue', 'teal', 'stripe', 'border', 'top line', 'flag'],
    body: [
      { kind: 'table', head: ['Colour', 'Meaning'], rows: [
        ['Red',   'Something is overdue, or the client is past their planned discharge date.'],
        ['Amber', 'Something is due today, or a concern has been raised.'],
        ['Green', 'On track — nothing outstanding.'],
        ['Blue',  'The bed is free. Blue is never a warning in this tool.'],
        ['Teal',  'The client is on an approved extension.'],
      ] },
      { kind: 'p', text: 'A coloured stripe along the top edge of a card is a flag on the client, not on their tasks:' },
      { kind: 'bullets', items: [
        'Red stripe — a restricted alert. Speak to the centre manager; the detail is deliberately not shown on the board.',
        'Amber stripe — an open concern has been logged.',
        'Teal stripe — an approved extension to their stay.',
      ] },
      { kind: 'note', text: 'Colour is never the only signal. Every coloured state also has words or a symbol, so the board still works if you cannot easily tell the colours apart.' },
    ],
  },
  {
    id: 'roomboard-filter',
    category: 'roomboard',
    title: 'How do I show only the beds I care about?',
    summary: 'The filter buttons above the board narrow it down to one group at a time.',
    keywords: ['filter', 'search bed', 'only show', 'narrow', 'overdue only', 'free beds only', 'hide'],
    body: [
      { kind: 'p', text: 'Above the board is a row of filter buttons. Click one to show only those beds; click it again (or click "All") to go back to everything.' },
      { kind: 'table', head: ['Filter', 'Shows'], rows: [
        ['All',           'Every bed.'],
        ['Occupied',      'Only beds with somebody in them.'],
        ['Available',     'Only free beds.'],
        ['Overdue',       'Clients with at least one overdue task.'],
        ['Due today',     'Clients with something due today.'],
        ['Discharging',   'Clients leaving before the end of this week.'],
        ['Photo',         'Clients with no photograph on file.'],
        ['Alerts',        'Clients with a restricted alert.'],
      ] },
      { kind: 'note', text: 'There is also a search box at the top of the page that finds a bed, client or staff member by name. Press Ctrl+K (Cmd+K on a Mac) to jump straight into it.' },
    ],
  },
  {
    id: 'gp-summary',
    category: 'roomboard',
    title: 'What is the GP summary rule?',
    summary: 'A GP summary must be completed within 3 days of admission. The bed card, the Treatment board and the GP Summary page all track it.',
    keywords: ['gp', 'gp summary', 'doctor summary', 'three days', '3 days', 'amber bar', 'red bar', 'medical', 'deadline', 'summary pending', 'pending'],
    body: [
      { kind: 'p', text: 'Every client needs a GP summary completed within 3 days of arriving. The tool tracks this automatically from their admission date — you do not need to set anything up.' },
      { kind: 'p', text: 'How the status appears on the bed card:' },
      { kind: 'table', head: ['What you see', 'What it means'], rows: [
        ['Red bar at the bottom of the card',   'Overdue — more than 3 days in and the GP summary has not been done.'],
        ['Amber bar at the bottom of the card', 'Due soon — the client is on day 2 or later.'],
        ['No bar',                              'Either done, or the client arrived today.'],
      ] },
      { kind: 'p', text: 'On the Overview dashboard there is a "GP summaries pending" tile. It shows how many are outstanding across all current clients and turns red if any are overdue.' },
      { kind: 'note', text: 'Mark the GP summary done by completing the GP Summary category on the Treatment board (click the cell, then tick the task inside), or from the client’s own task list. For a read-only, centre-wide view of every GP summary’s progress, see the next article.' },
    ],
  },
  {
    id: 'gpsummary-page',
    category: 'roomboard',
    title: 'What is the GP Summary page for?',
    summary: 'A live, filterable log of every client’s GP summary — surgery contact, dates, and sign-off — with a quick snapshot of where things stand.',
    keywords: ['gp summary page', 'gp summary log', 'surgery', 'request sent', 'received', 'confirmed', 'outstanding', 'doctor informed', 'compliant'],
    body: [
      { kind: 'p', text: 'Click "GP Summary" in the left menu for a centre-wide table: every client’s surgery name, email, phone, when the request was sent and received, who the doctor is, and when it was confirmed. It is read-only — the actual editing still happens from the Treatment board’s GP Summary category.' },
      { kind: 'p', text: 'Above the table, 5 cards give a quick snapshot of whatever is currently filtered:' },
      { kind: 'table', head: ['Card', 'Means'], rows: [
        ['Total',          'How many GP summaries are shown, for the current filter.'],
        ['Request Sent',   'How many have had the request sent to the surgery.'],
        ['Received',       'How many have had a reply back from the surgery.'],
        ['Confirmed',      'How many have been signed off as complete.'],
        ['Outstanding',    'How many are not yet confirmed — the ones still needing attention.'],
      ] },
      { kind: 'p', text: 'Use the date filter bar (Today, This Month, This Year, Last Year, This Quarter, Last Quarter, Last 6 Months, or a specific Month) to narrow everything — the table and the 5 cards — to admissions in that period. Search by client, reference or surgery name, and sort by admission date, discharge date, or name.' },
      { kind: 'note', text: 'The "Compliant" column is intentionally the one place in this tool where red means Yes and green means No — it is the opposite of Overdue/Done everywhere else, because here "Yes" means non-compliant. Read the word, not just the colour.' },
    ],
  },

  /* ───────────────────────── Treatment board ───────────────────────── */
  {
    id: 'treatmentboard-what',
    category: 'treatmentboard',
    title: 'What does the Treatment board show me?',
    summary: 'A compact grid: every client down the left, every required category across the top. Click a category to see the real tasks inside it.',
    keywords: ['grid', 'matrix', 'tasks', 'whiteboard', 'columns', 'big table', 'spreadsheet', 'category'],
    body: [
      { kind: 'p', text: 'The Treatment board is the electronic version of the wall whiteboard, kept compact: each row is one client, and each column is a whole category of related tasks (Admin, GP Summary, Contact/Comms, and so on) rather than one column per individual task. Each cell shows a rolled-up status for that category — Done, Overdue, Due, On track, or No actions — not a tick per task.' },
      { kind: 'p', text: 'Clicking a category cell opens a panel listing every real task inside that category for that client, where you tick things off individually. Clicking the client’s name/photo instead opens their full file.' },
      { kind: 'p', text: 'The client name and the Programme column stay fixed on the left as you scroll sideways, so you never lose your place.' },
      { kind: 'note', text: 'Use the Treatment board when you want to compare everyone at once, at a glance. Use the Room board when you want to look at one person. Open a category cell when you need the detail behind the rollup.' },
    ],
    screenshot: '/help-screenshots/treatment-board.png',
  },
  {
    id: 'treatmentboard-columns',
    category: 'treatmentboard',
    title: 'What are all the columns on the Treatment board?',
    summary: 'Client & Placement, Programme, Status, then 9 category columns — each one opens its own detail panel.',
    keywords: ['columns', 'sections', 'groups', 'ccp', 'step 1', 'step 2', 'step 3', 'life story', '121', 'cp', 'survey', 'family contact', 'doctor thursday', 'category columns'],
    body: [
      { kind: 'p', text: 'Reading left to right:' },
      { kind: 'table', head: ['Column', 'What it covers'], rows: [
        ['Client & Placement',      'Photo, name, reference, bed. Frozen — always visible while scrolling.'],
        ['Programme',               'Treatment day and planned discharge date. Also frozen.'],
        ['Status',                  'The manually-set Status flag (Graduate/Discharged/Extended/Transferred). See the dedicated article below.'],
        ['Admin',                   'Paperwork and set-up facts for the admission — focal therapist, substance, group, buddy, and similar.'],
        ['GP Summary',              'The GP summary task — see "What is the GP summary rule?".'],
        ['Contact/Comms',           '24-hour, week 1, week 2 and pre-discharge family contact.'],
        ['7 Day Satisfaction',      'The satisfaction survey at day seven.'],
        ['Family Visit',            'The family visit.'],
        ['Life Story / Step Work',  'Life story / surrender, Steps 1–3, and the CCP.'],
        ['Care Plan',               'The introductory counselling session and the weekly CP/121 sessions.'],
        ['Doctor – Thursday',  'The weekly doctor round.'],
        ['Side assignment',         'The rolled-up status of any extra, client-specific tasks added for this client.'],
      ] },
      { kind: 'note', text: 'Click any category cell (other than Client & Placement, Programme and Status) to open its own detail panel with the real tasks inside.' },
    ],
  },
  {
    id: 'treatmentboard-category-detail',
    category: 'treatmentboard',
    title: 'What happens when I click a category cell?',
    summary: 'A panel opens showing every real task in that category for that client, with its own status.',
    keywords: ['click cell', 'open category', 'category detail', 'category panel', 'rollup', 'what is inside'],
    body: [
      { kind: 'p', text: 'Clicking a category cell (Admin, Contact/Comms, Care Plan, and so on) opens a side panel listing the individual tasks inside that category for that specific client — exactly what used to be a whole column per task on the old-style board, now reached with one click instead of scrolling sideways.' },
      { kind: 'p', text: 'Each task inside shows the same Done / Overdue / Due today / Not due yet states as anywhere else in the tool, and you tick a task off from here the same way you would from the client’s own file.' },
      { kind: 'note', text: 'Doctor – Thursday currently has no internal fields recorded for any client — the panel says so honestly rather than inventing detail that is not tracked yet.' },
    ],
  },
  {
    id: 'treatmentboard-status-column',
    category: 'treatmentboard',
    title: 'What is the Status column, and how is it different from Discharge?',
    summary: 'Status is a quick manual flag anyone with access can set instantly. Discharge is the formal, multi-step process that actually frees the bed.',
    keywords: ['status column', 'status vs discharge', 'status flag', 'quick status', 'graduate flag', 'care status', 'status popup', 'set status'],
    body: [
      { kind: 'p', text: 'These two things look related and are easy to confuse, so it is worth being precise.' },
      { kind: 'table', head: ['', 'Status (the column)', 'Discharge (the workflow)'], rows: [
        ['What it is',        'A manual flag staff can set at any time, for anyone.', 'The formal process that ends treatment and frees the bed.'],
        ['Options',           'Graduate, Discharged, Extended, Transferred, or Not set.', 'Planned (Graduated), Early discharge, Transfer, Other — each with a structured Reason and Sub Reason.'],
        ['Who can change it', 'Applied instantly by whoever clicks it — no approval step.', 'Needs a different person to approve it (except a planned graduation, which needs no approval).'],
        ['Effect on the bed', 'None. The client stays exactly where they are.', 'Frees the bed once finalised.'],
        ['Where it appears',  'Treatment board, Room board, and the client’s file.', 'The Discharge page, the client’s file, and the Client Directory’s Status/Reason/Sub Reason columns.'],
      ] },
      { kind: 'p', text: 'In short: Status is a heads-up for the team ("we are expecting this client to graduate soon"), set independently of anything else. Discharge is the real, audited event that actually ends their stay. Setting Status to "Discharged" does not discharge anyone — it is just a note.' },
      { kind: 'steps', items: [
        'To set Status: click the Status cell for that client on the Treatment board (or the equivalent spot on the Room board or in their file).',
        'Pick an option — it applies immediately, with no further steps.',
      ] },
      { kind: 'note', text: 'To actually end someone’s treatment, use the Discharge panel in their file instead — see "How do I graduate a client who has finished their programme?" and "How do I record an early discharge?".' },
    ],
  },
  {
    id: 'treatmentboard-symbols',
    category: 'treatmentboard',
    title: 'What do the colours and labels on a category cell mean?',
    summary: 'Done, Overdue, Due, On track, or No actions — one rolled-up state per category, per client.',
    keywords: ['symbol', 'icon', 'tick', 'check', 'triangle', 'dot', 'dash', 'square', 'cell', 'legend', 'key', 'rollup states'],
    body: [
      { kind: 'table', head: ['State', 'Meaning'], rows: [
        ['Done (green)',           'Every task in this category is complete.'],
        ['Overdue (red)',          'One or more tasks were due and are unfinished.'],
        ['Due (amber)',            'One or more tasks are due today.'],
        ['On track / No actions (grey)', 'Assigned but not due yet, or nothing assigned to this client in this category.'],
      ] },
      { kind: 'p', text: 'The same key is printed underneath the board itself, so you never have to remember it. Open the category cell for the breakdown of which individual tasks are driving the state.' },
    ],
  },
  {
    id: 'treatmentboard-complete',
    category: 'treatmentboard',
    title: 'How do I mark a task as done?',
    summary: 'Click the category cell to open its tasks, then tick the one you need — or do it from the client’s own file.',
    keywords: ['complete', 'tick off', 'mark done', 'finish task', 'sign off', 'undo', 'reopen', 'mistake'],
    body: [
      { kind: 'steps', items: [
        'Find the client’s row and the category the task belongs to (e.g. Care Plan, Contact/Comms).',
        'Click that category cell to open its detail panel.',
        'Find the specific task in the list and tick it off. Your name and the time are recorded automatically.',
      ] },
      { kind: 'p', text: 'You can also open a client from either board and work down their full task list, which is easier when you are completing several things for one person across different categories.' },
      { kind: 'warn', text: 'Ticked something by mistake? Reopening a task needs the "reopen tasks" permission. If you do not have it, ask a manager — do not leave it ticked and hope. Both the completion and the reopening are recorded in the Activity log.' },
    ],
  },
  {
    id: 'tasks-reschedule',
    category: 'treatmentboard',
    title: "How do I change a task's due date?",
    summary: 'Open the client, find the task, click the calendar icon, and pick a new date with a reason.',
    keywords: ['reschedule', 'due date', 'change date', 'move date', 'postpone', 'wrong date', 'extend deadline', 'date changed', 'push back'],
    body: [
      { kind: 'steps', items: [
        'Open the client from either board, or from a category’s detail panel.',
        'Find the task in their task list.',
        'Click the small calendar icon next to the task.',
        'Pick a new due date and type a short reason — for example "client was unwell".',
        'Save. A "date changed" marker appears on the task so anyone reading the file knows the date moved.',
      ] },
      { kind: 'note', text: 'The original date, the new date, the reason and your name are all recorded automatically. Only template tasks can be rescheduled — side assignments can instead be deleted and re-added with a different day.' },
    ],
  },
  {
    id: 'treatmentboard-greyed',
    category: 'treatmentboard',
    title: 'Why does a category show "Not in programme" for a client?',
    summary: 'That module was not selected for their programme at admission.',
    keywords: ['faded', 'grey', 'gray', 'dimmed', 'not applicable', 'n/a', 'excluded', 'module', 'washed out', 'not in programme'],
    body: [
      { kind: 'p', text: 'When a client is admitted, staff tick which modules apply to their programme. Any category built from a module that was not ticked shows a neutral "Not in programme" state instead of turning red when it is not done — it is not overdue, it simply does not apply to them.' },
      { kind: 'p', text: 'The five optional modules are Contact / Comms, 7 Day Satisfaction, Family Visit, Life Story & Step Works, and Care Plan.' },
      { kind: 'note', text: 'Opening the category cell confirms the same thing in words: the tasks inside are not generated for a module the client was not enrolled in.' },
    ],
  },

  /* ───────────────────────── Clients ───────────────────────── */
  {
    id: 'clients-find',
    category: 'clients',
    title: 'How do I find a client?',
    summary: 'Go to Clients and type a name or reference. Everyone who ever stayed here is listed.',
    keywords: ['search', 'look up', 'find person', 'directory', 'reference number', 'past client', 'former', 'discharged client'],
    body: [
      { kind: 'steps', items: [
        'Click "Clients" in the left menu.',
        'Type a name, a reference number, or a word from a concern into the search box.',
        'Click anyone in the results to open their file.',
      ] },
      { kind: 'p', text: 'With the box empty you get everyone who has ever stayed at this centre — not just current residents. Use the dropdown on the right to switch between Everyone, Currently resident, and Former clients.' },
      { kind: 'note', text: 'If your access level does not allow you to see names, you can still search by reference number. The results will show references rather than names.' },
    ],
    screenshot: '/help-screenshots/clients.png',
  },
  {
    id: 'clients-date-filter',
    category: 'clients',
    title: 'How do I look at clients admitted in a certain period?',
    summary: 'Use the quick filter bar — Today, This Month, This Year, Last Year, This Quarter, Last Quarter, Last 6 Months, or pick a specific Month.',
    keywords: ['calendar', 'date', 'past', 'history', 'historical', 'as of', 'back in time', 'snapshot', 'last month', 'previous', 'date filter', 'quarter', 'month picker'],
    body: [
      { kind: 'p', text: 'Above the search/scope row is a row of date buttons. Click one to narrow the list to clients whose most recent admission falls in that period; click "Clear" to go back to everyone.' },
      { kind: 'table', head: ['Button', 'Shows admissions from'], rows: [
        ['Today',           'Today only.'],
        ['All Time',        'No date limit — the default.'],
        ['This Year',       'The current calendar year.'],
        ['Last Year',       'The previous calendar year (labelled with the actual year, e.g. "Last Year (2025)").'],
        ['This Quarter',    'The current 3-month quarter.'],
        ['Last Quarter',    'The previous 3-month quarter.'],
        ['Last 6 Months',   'A rolling 6 months up to today.'],
        ['Month',           'Pick any specific calendar month from the small month box next to the buttons.'],
      ] },
      { kind: 'warn', text: 'This filters on the admission date, not on whether the person had already left. A former client who was discharged long ago may still appear if their admission falls in the period you picked — treat it as "admitted in this period" rather than "resident in this period".' },
      { kind: 'note', text: 'This exact same filter bar appears, with identical behaviour, on the GP Summary and Discharge pages — learning it once covers all three.' },
    ],
  },
  {
    id: 'clients-activity-cards',
    category: 'clients',
    title: 'What do the Total Clients / Discharged / Graduated / Early Discharged / Transferred cards mean?',
    summary: 'A quick snapshot, above the table, of how many clients fall into each category for whatever period and search you currently have set.',
    keywords: ['activity cards', 'total clients', 'discharged count', 'graduated count', 'client activity', 'snapshot cards', 'census'],
    body: [
      { kind: 'p', text: 'Five cards sit above the Clients table, right below the date filter:' },
      { kind: 'table', head: ['Card', 'Counts'], rows: [
        ['Total Clients',       'Clients admitted in the selected period.'],
        ['Discharged',          'Clients discharged in the selected period, any type.'],
        ['Graduated',           'Of those, how many completed treatment as planned.'],
        ['Early Discharged',    'Of those, how many left before completing their programme.'],
        ['Transferred',         'Of those, how many moved to another facility.'],
      ] },
      { kind: 'p', text: 'These numbers are real — computed from exactly what the Clients search already returned, filtered to the date period you have picked. They update immediately when you change the date filter or search box.' },
      { kind: 'note', text: 'The "Currently resident / Former clients" scope dropdown does not affect these 5 cards — they always reflect the whole period’s activity, since that scope is about who is still here today, a different question from how many came and went in a given period.' },
    ],
  },
  {
    id: 'clients-file',
    category: 'clients',
    title: 'What is in a client’s file?',
    summary: 'Their details, their stay, their progress, and every task on their list.',
    keywords: ['client file', 'record', 'profile', 'detail panel', 'open client', 'history', 'admissions'],
    body: [
      { kind: 'p', text: 'Opening a client gives you one panel with everything about them:' },
      { kind: 'bullets', items: [
        'Who they are — photograph, name, reference, bed.',
        'Their stay — admission date, day of treatment, planned discharge, length.',
        'Their care team — therapist, buddy and other assigned staff.',
        'Their progress — how much of the required task list is complete.',
        'Their tasks — the full list, with dates, and whether each was done on time.',
        'Concerns and incidents raised about them.',
      ] },
      { kind: 'p', text: 'Opening a client from the Clients directory also shows every separate admission they have had at this centre, which is the only place a past stay can be seen.' },
      { kind: 'note', text: 'If they are currently in a bed, there is a button to jump straight to them on the Room board.' },
    ],
  },
  {
    id: 'clients-directory-columns',
    category: 'clients',
    title: 'What do all the columns in the Clients table mean?',
    summary: 'Name, Admission Date, Discharge Date, Status, Reason, Sub Reason, Total Tasks, Completed, Due/Overdue.',
    keywords: ['directory columns', 'clients table', 'status column clients', 'reason column', 'sub reason column', 'due overdue column'],
    body: [
      { kind: 'table', head: ['Column', 'Means'], rows: [
        ['Name',             'Client name (or reference, if you cannot see names) and photo.'],
        ['Admission Date',   'When their most recent stay at this centre began.'],
        ['Discharge Date',   'When it ended, if it has.'],
        ['Status',           '"In Treatment" if still admitted, otherwise Graduated / Early Discharged / Transferred / Other, from the formal discharge record — not the quick Status flag described in the Treatment board article.'],
        ['Reason',           'For a discharged client, the structured reason captured when it happened (e.g. the clinic they transferred to, or "Completed Treatment").'],
        ['Sub Reason',       'The more specific reason underneath that, where one applies (e.g. "Self Discharged").'],
        ['Total Tasks',      'How many tasks exist on their most recent admission.'],
        ['Completed',        'How many of those are done.'],
        ['Due/Overdue',      'How many are due today or already overdue, combined into one number.'],
      ] },
      { kind: 'note', text: 'Sort by Latest admission, Discharge date (either direction), or Name using the sort dropdown next to the search box.' },
    ],
  },
  {
    id: 'clients-photo',
    category: 'clients',
    title: "How do I add or change a client's photograph?",
    summary: 'Upload it during admission, or open the client at any time and replace it from their file. Real photos now show in the Clients directory too.',
    keywords: ['photo', 'photograph', 'picture', 'upload', 'image', 'missing photo', 'red question mark', 'no photo', 'add photo', 'change photo'],
    body: [
      { kind: 'p', text: 'There are two ways to add or change a photograph.' },
      { kind: 'table', head: ['When', 'How'], rows: [
        ['During admission',  'Scroll to the "Client photo (optional)" section at the bottom of the admission form and upload a file.'],
        ['After admission',   'Open the client from either board, find the photo area at the top of their file, and click it to upload a replacement.'],
      ] },
      { kind: 'p', text: 'Accepted formats: JPEG, PNG, or WebP. Maximum 5 MB. The image is resized automatically.' },
      { kind: 'p', text: 'What the corner badge on a bed card means:' },
      { kind: 'table', head: ['Badge', 'Means'], rows: [
        ['Red "?" corner',   'No photograph on file — a quick visual reminder to chase one.'],
        ['Green "✓" corner', 'A photograph is on file.'],
      ] },
      { kind: 'note', text: 'Photographs are only visible to staff with the "view photos" permission — anyone below that level sees initials instead, on every screen a photo would otherwise appear, including the Clients directory and a client’s own file.' },
    ],
  },

  /* ───────────────────────── Admissions ───────────────────────── */
  {
    id: 'admissions-admit',
    category: 'admissions',
    title: 'How do I admit a new client?',
    summary: 'Admissions → fill the form → check the review screen → confirm.',
    screenshot: '/help-screenshots/admissions.png',
    keywords: ['new client', 'admit', 'intake', 'book in', 'add client', 'arrival', 'new admission', 'create'],
    body: [
      { kind: 'steps', items: [
        'Click "Admissions" in the left menu.',
        'Fill in the client’s details — name, reference, arrival date and planned length of stay.',
        'Choose the bed they are going into. Only free beds are offered.',
        'Assign the care team — therapist, buddy and anyone else.',
        'Tick which programme modules apply (see the next article).',
        'Record any safeguarding information.',
        'Read the review screen. It repeats everything back to you before anything is saved.',
        'Click confirm. The client now appears on both boards and their task list is created automatically.',
      ] },
      { kind: 'note', text: 'The summary panel down the side updates as you type, so you can see what is still missing without scrolling back up.' },
      { kind: 'warn', text: 'You need the "create admissions" permission for this screen. Details can be corrected afterwards if you hold "edit admissions".' },
    ],
  },
  {
    id: 'admissions-modules',
    category: 'admissions',
    title: 'What are "programme modules" and which should I tick?',
    summary: 'They decide which Treatment board categories apply to this client. All five are on by default.',
    keywords: ['modules', 'programme', 'program', 'tick boxes', 'checkboxes', 'which columns', 'exclude', 'not applicable', 'customise'],
    body: [
      { kind: 'p', text: 'Not every client does every part of the programme. Ticking the modules at admission tells the Treatment board which categories to expect from them; anything you untick shows as "Not in programme" for that client instead of turning red when it is not done.' },
      { kind: 'table', head: ['Module', 'Covers'], rows: [
        ['Contact / Comms',          'The four family contact points.'],
        ['7 Day Satisfaction',       'The day-seven satisfaction survey.'],
        ['Family Visit',             'The family visit.'],
        ['Life Story & Step Works',  'Life story, Steps 1–3 and the CCP.'],
        ['Care Plan',                'The intro session and weekly CP/121 sessions.'],
      ] },
      { kind: 'note', text: 'All five start ticked. If the client is doing the standard full programme, leave them alone — you do not have to touch this section.' },
    ],
  },
  {
    id: 'admissions-custom',
    category: 'admissions',
    title: 'How do I add a side assignment to a client?',
    summary: 'Add extra tasks during admission, or afterwards from the client\'s profile. They appear in the purple Side assignment column on the Treatment board.',
    keywords: ['custom', 'side assignment', 'extra', 'manual', 'task', 'add task', 'additional', 'bespoke', 'one-off', 'side assignment column', 'custom task', 'additional assignment'],
    body: [
      { kind: 'p', text: 'Side assignments are tasks beyond the standard set — step work variations, extra one-to-one sessions, or anything specific to this client.' },
      { kind: 'p', text: 'During admission:' },
      { kind: 'steps', items: [
        'Scroll to "Additional assignments (optional)" — it sits just below the programme modules.',
        'Click "+ Add assignment".',
        'Enter the task name, the day of their stay it should be done by, and the type (Step work, Session, or Admin).',
        'Add as many as you need, then continue with the rest of the form.',
      ] },
      { kind: 'p', text: 'After admission:' },
      { kind: 'steps', items: [
        'Open the client from either board.',
        'Click "+ Add side assignment" above their task list.',
        'Fill in the same fields and save.',
      ] },
      { kind: 'p', text: 'Side assignments appear in the client\'s task list with a "✎ Side" chip. On the Treatment board they roll up into the "Side assignment" category — click it to see them all and their individual status. To remove one, open the task and click the red delete button next to it.' },
      { kind: 'warn', text: 'Only side assignments can be deleted. Standard template tasks can be rescheduled but not removed.' },
    ],
  },

  /* ───────────────────────── Leaving ───────────────────────── */
  {
    id: 'leaving-graduate',
    category: 'leaving',
    title: 'How do I graduate a client who has finished their programme?',
    summary: 'Open the client, choose the "Planned (Graduated)" card — the reason is fixed, and it discharges immediately.',
    keywords: ['graduate', 'graduation', 'complete treatment', 'finished', 'planned', 'leaving well', 'end of stay', 'sign out'],
    body: [
      { kind: 'p', text: 'A client who completes their programme on schedule is graduating. It is handled from the same Discharge panel as every other way of leaving, but it is the one case with no approval step, since nothing here is being flagged as a concern.' },
      { kind: 'steps', items: [
        'Open the client from either board.',
        'Find the Discharge panel in their file.',
        'Pick the "Planned (Graduated)" card — it is listed and highlighted first, as the common case.',
        'There is nothing to type for the reason — it is fixed as "Completed Treatment" and shown as a confirmation line, not a choice.',
        'Enter the date, add any report details (where the discharge report was sent, a referral partner, notes), and click Discharge.',
      ] },
      { kind: 'note', text: 'This is the only discharge type that completes in one step. Every other type needs a different person to approve it before it can be finalised — see the next article.' },
    ],
  },
  {
    id: 'leaving-discharge',
    category: 'leaving',
    title: 'How do I record an early discharge?',
    summary: 'Choose "Early discharge", then pick a Reason and a Sub Reason from its own list.',
    keywords: ['discharge', 'early', 'unplanned', 'left early', 'walked out', 'self discharge', 'ama', 'removed', 'against clinical advice'],
    body: [
      { kind: 'p', text: 'A client leaving before the end of their programme, for reasons short of a transfer, is an early discharge. Pick the "Early discharge" card in the Discharge panel, then choose a structured Reason and Sub Reason — these are not free text, so the numbers on the Clients and Discharge pages stay comparable across the whole centre.' },
      { kind: 'table', head: ['Reason', 'Sub Reason options'], rows: [
        ['Self Discharged', 'Against Clinical Advice · Personal Reasons · Family Emergency · Lack of Motivation · Cravings / Relapse Intention · Homesickness or isolation'],
        ['Medical / Treatment Discharged', 'Non-compliance with Treatment · Failed Substance Test · Behavioural Issues - Risk to Others · Psychiatric Needs (several) · Physical Needs (several — self-care/mobility, risk of infection, cardiac risks)'],
      ] },
      { kind: 'steps', items: [
        'Open the client and find the Discharge panel.',
        'Pick the "Early discharge" card.',
        'Choose a Reason, then a Sub Reason from the list that appears underneath it.',
        'Submit for approval. A different person must approve it before it can be finalised.',
        'Once approved, someone with the finalise permission enters the date and report details to complete it.',
      ] },
      { kind: 'warn', text: 'Early discharges are counted separately from graduations everywhere this tool reports on outcomes, because they mean something different. Choosing the right Reason and Sub Reason matters for those numbers to be worth anything.' },
    ],
  },
  {
    id: 'leaving-transfer',
    category: 'leaving',
    title: 'How do I record a transfer to another facility?',
    summary: 'Choose "Transfer", then pick which clinic (Reason) and why (Sub Reason).',
    keywords: ['transfer', 'moved', 'another facility', 'another centre', 'clinics dropdown', 'detox required', 'unhappy with service', 'secondary care', 'providence'],
    body: [
      { kind: 'p', text: 'A client moving to another facility or programme is a transfer. Like early discharge, it uses a structured Reason and Sub Reason rather than free text, plus a couple of extra operational fields.' },
      { kind: 'steps', items: [
        'Open the client and find the Discharge panel.',
        'Pick the "Transfer" card.',
        'Reason: choose which clinic they are going to, from the group’s own list of centres. The centre the client is currently at is automatically left off this list — you cannot "transfer" someone to where they already are.',
        'Sub Reason: choose why — High Level of Detox required, Unhappy with the current service, or Secondary Care with Providence.',
        'Optionally fill in the treatment type at the destination, the expected duration, and a free-text note for anything the dropdowns do not cover.',
        'Submit for approval, then have it approved and finalised the same way as an early discharge.',
      ] },
      { kind: 'note', text: 'A client who stays a UKAT client but moves between a group’s own centres uses this exact same flow — pick that centre as the Reason.' },
    ],
  },
  {
    id: 'leaving-other',
    category: 'leaving',
    title: 'What is the "Other" discharge type for?',
    summary: 'Anything the three structured types do not cover — explain it in the free-text reason.',
    keywords: ['other discharge', 'other reason', 'anything else', 'free text discharge'],
    body: [
      { kind: 'p', text: 'Pick "Other" only when Planned (Graduated), Early discharge and Transfer genuinely do not describe what happened. Unlike the other types, Other still uses a plain free-text reason — write a short, clear explanation, since there is no fixed taxonomy for it yet.' },
      { kind: 'p', text: 'It goes through the same approval and finalise steps as Early discharge and Transfer.' },
    ],
  },
  {
    id: 'leaving-extend',
    category: 'leaving',
    title: 'How do I extend someone’s stay?',
    summary: 'Open the client and use the "Extend stay" panel.',
    keywords: ['extend', 'extension', 'longer', 'more days', 'stay longer', 'push back discharge', 'change discharge date'],
    body: [
      { kind: 'steps', items: [
        'Open the client from either board.',
        'Find the "Extend stay" panel in their file.',
        'Enter the new planned discharge date and the reason.',
        'Submit it for approval.',
      ] },
      { kind: 'p', text: 'Once approved, the client’s card gets a teal top stripe and a "+Nd ext." marker so everyone can see at a glance that the longer stay is authorised rather than an overrun.' },
      { kind: 'note', text: 'Extend the stay before the original discharge date passes. If it passes first, the client shows as red and "past planned discharge" on every management screen until it is sorted out.' },
    ],
  },
  {
    id: 'discharge-page',
    category: 'leaving',
    title: 'What is the Discharge page for?',
    summary: 'A live, filterable view of who is leaving today, who is due this week or later, and the full history of everyone who already has.',
    keywords: ['discharge page', 'discharge log', 'discharged today', 'upcoming discharge', 'future discharge', 'past discharges', 'discharge tabs'],
    body: [
      { kind: 'p', text: 'Click "Discharge" in the left menu for a centre-wide view with 4 tabs:' },
      { kind: 'table', head: ['Tab', 'Shows'], rows: [
        ['Discharged Today',               'Everyone discharged today, any type.'],
        ['Upcoming Discharge (this week)', 'Still-admitted clients whose planned discharge date falls in the rest of this week — including anyone already overdue, since that is the most urgent case.'],
        ['Future Discharge',               'Still-admitted clients planned to leave later than this week.'],
        ['Past Discharges',                'Everyone discharged before today — the full history.'],
      ] },
      { kind: 'p', text: 'No tab is selected by default — that view shows everyone discharged, ever, the same as before these tabs existed. Click a tab to narrow down; click it again to clear back to everyone.' },
      { kind: 'p', text: 'A second row of quick-snapshot cards sits below the date filter. On the discharged-type tabs, it breaks down whatever is currently shown by type — Graduated, Early Discharged, Transferred, Other. On the Upcoming/Future tabs (nobody has actually discharged yet), it instead shows the manually-set Status flag breakdown — Graduate-flagged, Extended, Transferred-flagged, Status Not Set.' },
      { kind: 'note', text: 'The same date filter bar as Clients and GP Summary is here too, narrowing by whichever date is relevant to the active tab — left-treatment date on the discharged tabs, planned discharge date on Upcoming/Future.' },
    ],
  },

  /* ───────────────────────── Concerns & incidents ───────────────────────── */
  {
    id: 'concerns-raise',
    category: 'concerns',
    title: 'How do I raise a concern about a client?',
    summary: 'Open the client and use the concerns section to write it down.',
    keywords: ['concern', 'worry', 'flag', 'note', 'issue', 'raise', 'safeguarding', 'welfare', 'amber'],
    body: [
      { kind: 'steps', items: [
        'Open the client from either board.',
        'Find the concerns section in their file.',
        'Describe the concern in plain language and save it.',
      ] },
      { kind: 'p', text: 'An open concern puts an amber stripe along the top of that client’s card, so the next person to look at the board knows without opening anything.' },
      { kind: 'note', text: 'Your name is stored with the concern automatically. Concerns stay visible until somebody resolves them.' },
    ],
  },
  {
    id: 'incidents-file',
    category: 'concerns',
    title: 'What is the difference between a concern and an incident report?',
    summary: 'A concern is a worry to keep an eye on. An incident report records something that actually happened.',
    keywords: ['incident', 'report', 'difference', 'when to use', 'formal', 'accident', 'event', 'serious'],
    body: [
      { kind: 'table', head: ['', 'Concern', 'Incident report'], rows: [
        ['What it is', 'Something you are worried about.', 'Something that happened and must be formally recorded.'],
        ['Where',      'In the client’s file.',           'The Incident reports screen.'],
        ['Effect',     'Amber stripe on their card.',         'Counted on the Overview and group hub for seven days.'],
        ['Use it when','You want the next shift to be aware.','There has been an actual event needing a record.'],
      ] },
      { kind: 'note', text: 'If you are unsure which to use, raise a concern — it is quick, and the detail can always be written up as a formal report afterwards.' },
    ],
  },
  {
    id: 'incidents-create',
    category: 'concerns',
    title: 'How do I file a formal incident report?',
    summary: 'The Incident reports screen — ask your administrator for the direct link if it is not in your left menu yet.',
    keywords: ['incident', 'report', 'file', 'formal', 'record', 'accident', 'event', 'serious', 'document', 'create incident', 'new incident', 'log incident'],
    body: [
      { kind: 'steps', items: [
        'Open the Incident reports screen — click it in the left menu if it is shown there, or use the direct link your administrator gives you.',
        'Click the button to create a new report.',
        'Fill in the date, time, type of incident, what happened, and who was involved.',
        'Save. It is immediately visible to anyone who has access to the Incident reports screen.',
      ] },
      { kind: 'warn', text: 'Whether "Incident reports" shows in your left menu depends on how this centre has set up its navigation — it is a real, working screen either way, just not always linked from the menu. If you expect it and cannot find it, ask an administrator for the link rather than assuming the feature is missing.' },
      { kind: 'note', text: 'Incidents filed in the last seven days are counted on the Overview dashboard and the group hub, so managers see them without having to open each report individually.' },
    ],
  },

  /* ───────────────────────── Oversight ───────────────────────── */
  {
    id: 'oversight-overview',
    category: 'oversight',
    title: 'What is the centre Overview for?',
    summary: 'The headline numbers for this one centre, and anything needing attention today.',
    keywords: ['overview', 'dashboard', 'summary', 'stats', 'numbers', 'kpi', 'metrics', 'at a glance'],
    body: [
      { kind: 'p', text: 'The Overview is the first screen to open at the start of a shift. It answers "is this centre running properly today, and if not, what do I look at first" without you having to read either board.' },
      { kind: 'p', text: 'It covers occupancy, tasks due and overdue, clients graduating this week, and anything flagged for attention.' },
    ],
    screenshot: '/help-screenshots/centre-overview.png',
  },
  {
    id: 'oversight-hub',
    category: 'oversight',
    title: 'What is the group hub?',
    summary: 'All centres in one view, for managers and directors.',
    keywords: ['group hub', 'all centres', 'executive', 'exec', 'estate', 'across centres', 'compare', 'region', 'north', 'south'],
    body: [
      { kind: 'p', text: 'The group hub is the view above any single centre. It opens with a plain-English verdict — for example "7 centres need attention" — and then explains it with numbers underneath.' },
      { kind: 'bullets', items: [
        'The ring shows overall occupancy across every centre in scope.',
        'The buttons at the top right narrow the view to one region or a handful of picked centres.',
        'The "By region" table compares North and South.',
        'The "All centres" table lists every centre — sort it by free beds, occupancy, most issues, name or region.',
        'Clicking any centre takes you into it.',
      ] },
      { kind: 'warn', text: 'Read the amber "What is real on this page" box at the bottom. Only Primrose Lodge’s current-day figures come from real data — the other centres’ occupancy, overdue counts and on-time rates are placeholders while the data is being connected.' },
    ],
    screenshot: '/help-screenshots/group-hub.png',
  },
  {
    id: 'oversight-audit',
    category: 'oversight',
    title: 'How do I find out who changed something?',
    summary: 'The Activity log records every change, with a name and a timestamp.',
    keywords: ['audit', 'activity log', 'history', 'who did', 'changed', 'trail', 'log', 'accountability', 'when was'],
    body: [
      { kind: 'steps', items: [
        'Click "Activity log" in the left menu.',
        'Use the filters to narrow by what kind of change you are looking for.',
        'Each entry shows what changed, who changed it and exactly when.',
      ] },
      { kind: 'p', text: 'Everything meaningful is recorded automatically — completing a task, reopening one, admitting a client, approving a discharge, changing someone’s access. You never have to remember to log anything.' },
      { kind: 'note', text: 'Viewing the Activity log needs the "view audit" permission.' },
    ],
  },

  /* ───────────────────────── Administration ───────────────────────── */
  {
    id: 'admin-staff',
    category: 'admin',
    title: 'How do I manage staff and their access?',
    summary: 'Administration → User Management — add a team member and grant their access level in one step.',
    keywords: ['staff', 'users', 'permissions', 'roles', 'add user', 'invite', 'access', 'remove someone', 'new starter', 'add team member', 'temporary password', 'grant additional access', 'user management'],
    body: [
      { kind: 'p', text: 'Click "Administration" in the left menu, on the "User Management" tab (there is also a "Rooms & beds" tab — see the next article).' },
      { kind: 'p', text: 'At the top, 5 cards show every access level with a one-line summary — click "Show details" on any card for exactly what it covers and excludes. See "What are the 5 access levels and what can each one do?" for the full breakdown.' },
      { kind: 'p', text: 'Two buttons sit below the cards, side by side:' },
      { kind: 'table', head: ['Button', 'What it does'], rows: [
        ['Add team member',        'The common case — one form creates a brand-new sign-in and grants their access level, in a single step. Fill in their full name, email, pick a role from the cards, pick a centre, and either type a temporary password or leave it blank to have one generated. The password is shown back to you exactly once, in a box with a Copy button — write it down or pass it on straight away, since it cannot be retrieved again afterwards.'],
        ['Grant additional access', 'The advanced form, for anything the simple flow does not cover: someone who already has a sign-in, access across multiple centres or the whole organisation, a time-limited grant, or read-only access.'],
      ] },
      { kind: 'p', text: 'The Users table below lists everyone with access, their role and scope, and lets you revoke a grant or deactivate someone’s account.' },
      { kind: 'warn', text: 'This whole screen needs the "manage users" permission, held only by Super Admin, so it will not appear in your menu unless you hold it.' },
    ],
  },
  {
    id: 'admin-rooms',
    category: 'admin',
    title: 'How do I add or change a room or bed?',
    summary: 'Administration → Rooms & beds.',
    keywords: ['rooms', 'beds', 'capacity', 'add bed', 'shared room', 'layout', 'remove bed', 'rename'],
    body: [
      { kind: 'steps', items: [
        'Click "Administration" in the left menu.',
        'Open the "Rooms & beds" tab.',
        'Add, rename or remove rooms and beds there.',
      ] },
      { kind: 'p', text: 'Changes appear on the Room board straight away and change the centre’s capacity figure everywhere it is shown.' },
      { kind: 'warn', text: 'You cannot remove a bed that somebody is currently in. Move or discharge the client first.' },
    ],
  },

  /* ───────────────────────── Glossary ───────────────────────── */
  {
    id: 'glossary-terms',
    category: 'glossary',
    title: 'What do all the words mean?',
    summary: 'Plain-English definitions of every term used in the tool.',
    keywords: ['glossary', 'definition', 'meaning', 'jargon', 'terms', 'ccp', 'cp121', 'buddy', 'peeps', 'detox', 'vocabulary', 'what does mean'],
    body: [
      { kind: 'table', head: ['Term', 'Means'], rows: [
        ['Graduate / Graduated', 'A client finishing their programme as planned. The good outcome. Also the name of the fixed reason recorded for it: "Completed Treatment".'],
        ['Discharge',           'A client leaving — covers Planned (Graduated), Early discharge, Transfer, and Other. "Discharge" used loosely by staff usually means the early/unplanned kind.'],
        ['Early discharge',     'Leaving before completing the programme. Has its own Reason (Self Discharged, or Medical / Treatment Discharged) and a Sub Reason underneath.'],
        ['Transfer',            'Moving to another facility or programme. Reason is which clinic; Sub Reason is why.'],
        ['Status (care status)','A quick, manually-set flag (Graduate/Discharged/Extended/Transferred/Not set) — independent of the formal Discharge workflow. See the dedicated article in Treatment board.'],
        ['Extension',           'An approved longer stay, with a new planned discharge date.'],
        ['Overdue',             'A task whose due date has passed and which has not been done.'],
        ['Due today',           'A task that must be completed today.'],
        ['On time',             'A task completed on or before its due date.'],
        ['Treatment day',       'How many days into their programme a client is.'],
        ['Planned discharge',   'The date a client is expected to leave.'],
        ['Occupancy',           'The share of beds that are filled.'],
        ['Buddy',               'Another client paired with them for peer support.'],
        ['Therapist',           'The clinician assigned to that client.'],
        ['CCP',                 'Care & Continuing Plan.'],
        ['CP / 121',            'A one-to-one counselling session.'],
        ['Life story',          'The life story / surrender piece of step work.'],
        ['Restricted alert',    'A flag whose detail is deliberately withheld from the board. Speak to the centre manager.'],
        ['Concern',             'A logged worry about a client. Shows as an amber stripe.'],
        ['Incident report',     'A formal record of something that happened.'],
        ['Reference',           'The client’s ID code, used when names cannot be shown.'],
        ['Module',              'An optional part of the programme, ticked at admission.'],
        ['Group hub',           'The all-centres view above any single centre.'],
        ['Super Admin',         'The access level with every permission, at every centre.'],
        ['Operations Manager',  'Oversight and approval authority across every centre, no hands-on clinical work.'],
        ['Centre Manager',      'Full control of one centre.'],
        ['Clinical Staff',      'Does the clinical work — therapists, support workers and similar roles.'],
        ['View Only',           'View-only access, for maintenance, reception or other centre staff.'],
      ] },
    ],
  },
  {
    id: 'glossary-symbols',
    category: 'glossary',
    title: 'What do the symbols and badges mean?',
    summary: 'A single list of every mark you will see on a board.',
    keywords: ['symbols', 'icons', 'badges', 'marks', 'legend', 'key', 'flag', 'question mark', 'red circle'],
    body: [
      { kind: 'table', head: ['Mark', 'Where', 'Meaning'], rows: [
        ['Done (green)',          'Treatment board category cell', 'Every task in this category is complete.'],
        ['Overdue (red)',         'Treatment board category cell', 'One or more tasks are overdue.'],
        ['Due (amber)',           'Treatment board category cell', 'One or more tasks are due today.'],
        ['On track / No actions (grey)', 'Treatment board category cell', 'Not due yet, or nothing assigned.'],
        ['Status chip',           'Treatment board, Room board, client file', 'The manually-set Status flag — Graduate/Discharged/Extended/Transferred.'],
        ['Red number badge',      'Bed card corner',  'How many things need attention for that client.'],
        ['Red "?" on photo',      'Bed card',         'No photograph on file.'],
        ['Green "✓" on photo','Bed card',        'Photograph on file.'],
        ['⚑ red flag',       'Bed card',         'Restricted alert — speak to the centre manager.'],
        ['Red top stripe',        'Bed card',         'Restricted alert on this client.'],
        ['Amber top stripe',      'Bed card',         'An open concern.'],
        ['Teal top stripe',       'Bed card',         'Approved extension.'],
        ['"+Nd ext."',            'Bed card',         'Stay extended by N days.'],
        ['"shared"',              'Bed label',        'One of two beds in that room.'],
        ['✎ Side chip',      'Client task list', 'This task was added manually, not from the standard template. It can be deleted.'],
      ] },
    ],
  },
];
