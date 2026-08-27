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
  { id: 'start',          label: 'Getting started',   blurb: 'What this tool is and how to move around it' },
  { id: 'roomboard',      label: 'Room board',        blurb: 'Who is in which bed, right now' },
  { id: 'treatmentboard', label: 'Treatment board',   blurb: 'Every required task for every client' },
  { id: 'clients',        label: 'Clients',           blurb: 'Finding people and reading their file' },
  { id: 'admissions',     label: 'Admissions',        blurb: 'Bringing someone into treatment' },
  { id: 'leaving',        label: 'Graduating & leaving', blurb: 'Graduation, discharge and extensions' },
  { id: 'concerns',       label: 'Concerns & incidents', blurb: 'Raising something that needs attention' },
  { id: 'oversight',      label: 'Reports & oversight', blurb: 'Overview, group hub and the activity log' },
  { id: 'admin',          label: 'Administration',    blurb: 'Staff, rooms and access' },
  { id: 'glossary',       label: 'Words & symbols',   blurb: 'What the terms and icons mean' },
];

export const ARTICLES: readonly HelpArticle[] = [
  /* ───────────────────────── Getting started ───────────────────────── */
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
        'What you can see and do depends on your role. If a button is missing, that is why.',
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
        ['Treatment board',  'A big grid: every client down the side, every required task across the top.'],
        ['Room board',       'Every bed in the building and who is in it.'],
        ['Clients',          'Search for anyone who has ever stayed here, past or present.'],
        ['Admissions',       'Bring a new client into treatment.'],
        ['Incident reports', 'Things that went wrong and were formally recorded.'],
        ['Activity log',     'Who changed what, and when.'],
        ['Administration',   'Staff, permissions, rooms and beds.'],
        ['Back to group hub','Leave this centre and see all centres.'],
      ] },
      { kind: 'note', text: 'The arrow at the very bottom of the menu collapses it to icons only, which gives you more room on a small screen. Click it again to bring the words back.' },
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
      { kind: 'note', text: 'You will only see centres you have been given access to. If a centre you expect is missing, ask an administrator to add you — see "Who can do what?".' },
    ],
  },
  {
    id: 'permissions-why-missing',
    category: 'start',
    title: 'Why can’t I see a button other people can see?',
    summary: 'Your role decides what you can do. Missing buttons are a permission, not a bug.',
    keywords: ['permission', 'access', 'role', 'cannot', 'can’t', 'button missing', 'greyed out', 'not allowed', 'denied', 'blocked'],
    body: [
      { kind: 'p', text: 'Every action in the tool is tied to a named permission, and every person is given a set of them. If you do not hold the permission, the button is not shown at all — rather than shown and then refusing to work.' },
      { kind: 'p', text: 'Common examples:' },
      { kind: 'bullets', items: [
        'You can see a client’s reference number but not their name — you do not hold "view identity".',
        'You can see tasks but cannot tick them off — you do not hold "complete tasks".',
        'You can start a discharge but not approve one — approval is deliberately a separate permission.',
        'The Administration screen is missing entirely — that needs "manage users".',
      ] },
      { kind: 'note', text: 'If you need a permission you do not have, ask your centre manager or an administrator. They can change it under Administration → System access.' },
    ],
  },

  /* ───────────────────────── Room board ───────────────────────── */
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
    summary: 'Photo, name, day of treatment, discharge date, therapist, progress bar, status line.',
    keywords: ['card', 'bed card', 'understand', 'meaning', 'day of', 'progress bar', 'therapist', 'initials'],
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
    summary: 'A GP summary must be completed within 3 days of admission. The bed card and Overview dashboard both track it.',
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
      { kind: 'note', text: 'Mark the GP summary done by completing the GP Summary task in the client\'s task list — click the square in the Treatment board or tick it from inside their profile.' },
    ],
  },

  /* ───────────────────────── Treatment board ───────────────────────── */
  {
    id: 'treatmentboard-what',
    category: 'treatmentboard',
    title: 'What does the Treatment board show me?',
    summary: 'A grid: every client down the left, every required task across the top.',
    keywords: ['grid', 'matrix', 'tasks', 'whiteboard', 'columns', 'big table', 'spreadsheet'],
    body: [
      { kind: 'p', text: 'The Treatment board is the electronic version of the wall whiteboard. Each row is one client. Each column is one task that has to happen at some point during their stay. Each square tells you whether that task is done, due, or still to come.' },
      { kind: 'p', text: 'Scroll sideways to see all the columns — the client names stay fixed on the left so you never lose your place.' },
      { kind: 'note', text: 'Use the Treatment board when you want to compare everyone at once. Use the Room board when you want to look at one person.' },
    ],
    screenshot: '/help-screenshots/treatment-board.png',
  },
  {
    id: 'treatmentboard-columns',
    category: 'treatmentboard',
    title: 'What are all the columns on the Treatment board?',
    summary: 'They are grouped into coloured sections: admin, contact, survey, visit, step work, care plan, doctor.',
    keywords: ['columns', 'sections', 'groups', 'ccp', 'step 1', 'step 2', 'step 3', 'life story', '121', 'cp', 'survey', 'family contact', 'doctor thursday'],
    body: [
      { kind: 'p', text: 'The coloured band above the column headings tells you which section you are in.' },
      { kind: 'table', head: ['Section', 'Columns', 'What it covers'], rows: [
        ['Admin',                   '10', 'Paperwork and set-up tasks for a new admission.'],
        ['Contact / Comms',         '4',  '24-hour, week 1, week 2 and pre-discharge family contact.'],
        ['7 Day Satisfaction',      '1',  'The satisfaction survey at day seven.'],
        ['Family Visit',            '1',  'The family visit.'],
        ['Life Story & Step Works', '6',  'Life story / surrender, Steps 1–3, side assignment, and the CCP.'],
        ['Care Plan',               '5',  'The introductory counselling session and the weekly CP/121 sessions.'],
        ['Doctor – Thursday',  '1',  'The weekly doctor round.'],
        ['Custom',             '1',  'Rolled-up status of any custom assignments added for this client. A coloured chip shows the worst status across all of them.'],
      ] },
      { kind: 'note', text: 'Hover over any column heading to see its full name — the headings are shortened to keep the grid readable.' },
    ],
  },
  {
    id: 'treatmentboard-symbols',
    category: 'treatmentboard',
    title: 'What do the symbols in each square mean?',
    summary: 'Tick = done, triangle = overdue, dot = due today, dash = not due yet.',
    keywords: ['symbol', 'icon', 'tick', 'check', 'triangle', 'dot', 'dash', 'square', 'cell', 'legend', 'key'],
    body: [
      { kind: 'table', head: ['Symbol', 'Meaning'], rows: [
        ['✓ Tick (green)',      'Done — this task has been completed.'],
        ['▲ Triangle (red)',    'Overdue — it was due and has not been done.'],
        ['● Dot (amber)',       'Due today — it must be done today.'],
        ['— Dash (grey)',       'Still to come — not due yet.'],
      ] },
      { kind: 'p', text: 'The same key is printed underneath the board itself, so you never have to remember it.' },
    ],
  },
  {
    id: 'treatmentboard-complete',
    category: 'treatmentboard',
    title: 'How do I mark a task as done?',
    summary: 'Click the square, or open the client and tick it in their task list.',
    keywords: ['complete', 'tick off', 'mark done', 'finish task', 'sign off', 'undo', 'reopen', 'mistake'],
    body: [
      { kind: 'steps', items: [
        'Find the client’s row and the task’s column.',
        'Click the square where they meet.',
        'Confirm in the panel that opens. Your name and the time are recorded automatically.',
      ] },
      { kind: 'p', text: 'You can also open a client from either board and work down their full task list, which is easier when you are completing several things for one person.' },
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
        'Open the client from either board.',
        'Find the task in their task list.',
        'Click the small calendar icon next to the task.',
        'Pick a new due date and type a short reason — for example "client was unwell".',
        'Save. A "date changed" marker appears on the task so anyone reading the file knows the date moved.',
      ] },
      { kind: 'note', text: 'The original date, the new date, the reason and your name are all recorded automatically. Only template tasks can be rescheduled — custom assignments can instead be deleted and re-added with a different day.' },
    ],
  },
  {
    id: 'treatmentboard-greyed',
    category: 'treatmentboard',
    title: 'Why are some columns greyed out for a client?',
    summary: 'That module was not selected for their programme at admission.',
    keywords: ['faded', 'grey', 'gray', 'dimmed', 'not applicable', 'n/a', 'excluded', 'module', 'washed out'],
    body: [
      { kind: 'p', text: 'When a client is admitted, staff tick which modules apply to their programme. Anything not ticked shows as a faded column with a dash for that client — it is not overdue, it simply does not apply to them.' },
      { kind: 'p', text: 'The five optional modules are Contact / Comms, 7 Day Satisfaction, Family Visit, Life Story & Step Works, and Care Plan.' },
      { kind: 'note', text: 'Hovering over a faded square tells you the same thing: "Not included in this client’s treatment programme".' },
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
      { kind: 'note', text: 'If your role does not allow you to see names, you can still search by reference number. The results will show references rather than names.' },
    ],
    screenshot: '/help-screenshots/clients.png',
  },
  {
    id: 'clients-date-filter',
    category: 'clients',
    title: 'How do I look at who was here on a past date?',
    summary: 'Use the calendar box in the filter bar to pick a snapshot date.',
    keywords: ['calendar', 'date', 'past', 'history', 'historical', 'as of', 'back in time', 'snapshot', 'last month', 'previous'],
    body: [
      { kind: 'steps', items: [
        'Go to Clients.',
        'Click the calendar box in the filter bar and choose a date.',
        'The list narrows to clients admitted on or before that date. The count on the right reads "N results as of …".',
        'Click the small × in the box to clear it and go back to everyone.',
      ] },
      { kind: 'warn', text: 'One thing to know: this filters on the admission date, not on whether the person had already left. A former client who was discharged before your chosen date may still appear in the list. Treat it as "admitted by this date" rather than "resident on this date".' },
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
    id: 'clients-photo',
    category: 'clients',
    title: "How do I add or change a client's photograph?",
    summary: 'Upload it during admission, or open the client at any time and replace it from their file.',
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
      { kind: 'note', text: 'Photographs are only visible to staff with the "view identity" permission. Anyone below that level sees initials instead.' },
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
    summary: 'They decide which Treatment board columns apply to this client. All five are on by default.',
    keywords: ['modules', 'programme', 'program', 'tick boxes', 'checkboxes', 'which columns', 'exclude', 'not applicable', 'customise'],
    body: [
      { kind: 'p', text: 'Not every client does every part of the programme. Ticking the modules at admission tells the Treatment board which columns to expect from them; anything you untick shows as a faded column with a dash instead of turning red when it is not done.' },
      { kind: 'table', head: ['Module', 'Covers'], rows: [
        ['Contact / Comms',          'The four family contact points.'],
        ['7 Day Satisfaction',       'The day-seven satisfaction survey.'],
        ['Family Visit',             'The family visit.'],
        ['Life Story & Step Works',  'Life story, Steps 1–3, side assignment and CCP.'],
        ['Care Plan',                'The intro session and weekly CP/121 sessions.'],
      ] },
      { kind: 'note', text: 'All five start ticked. If the client is doing the standard full programme, leave them alone — you do not have to touch this section.' },
    ],
  },
  {
    id: 'admissions-custom',
    category: 'admissions',
    title: 'How do I add a custom assignment to a client?',
    summary: 'Add extra tasks during admission, or afterwards from the client\'s profile. They appear in the purple Extra column on the Treatment board.',
    keywords: ['custom', 'assignment', 'extra', 'manual', 'task', 'add task', 'additional', 'bespoke', 'one-off', 'extra column', 'custom task', 'additional assignment'],
    body: [
      { kind: 'p', text: 'Custom assignments are tasks beyond the standard set — step work variations, extra one-to-one sessions, or anything specific to this client.' },
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
        'Click "+ Add custom assignment" above their task list.',
        'Fill in the same fields and save.',
      ] },
      { kind: 'p', text: 'Custom assignments appear in the client\'s task list with a "✎ Custom" chip. On the Treatment board they roll up into the purple "Extra" column — a single chip shows the worst status across all of them. To remove one, open the task and click the red delete button next to it.' },
      { kind: 'warn', text: 'Only custom assignments can be deleted. Standard template tasks can be rescheduled but not removed.' },
    ],
  },

  /* ───────────────────────── Leaving ───────────────────────── */
  {
    id: 'leaving-graduate',
    category: 'leaving',
    title: 'How do I graduate a client who has finished their programme?',
    summary: 'Open the client, use the discharge panel, choose "Planned", then approve and finalise.',
    keywords: ['graduate', 'graduation', 'complete treatment', 'finished', 'planned', 'leaving well', 'end of stay', 'sign out'],
    body: [
      { kind: 'p', text: 'A client who completes their programme on schedule is graduating. It is handled in the same panel as discharge, but the outcome is recorded as planned rather than early.' },
      { kind: 'steps', items: [
        'Open the client from either board.',
        'Find the discharge panel in their file.',
        'Choose "Planned (on schedule)" as the type.',
        'Submit it. This creates a request — it does not immediately free the bed.',
        'Someone with the approval permission approves it. You cannot approve your own request.',
        'Once approved, someone with the finalise permission completes it. The bed is then free.',
      ] },
      { kind: 'note', text: 'Three separate permissions — initiate, approve, finalise — exist on purpose, so that no one person can move a client out of a bed unchecked.' },
    ],
  },
  {
    id: 'leaving-discharge',
    category: 'leaving',
    title: 'How do I record an early discharge?',
    summary: 'Same panel, but choose Early discharge, Transfer or Other.',
    keywords: ['discharge', 'early', 'unplanned', 'left early', 'walked out', 'transfer', 'self discharge', 'ama', 'removed'],
    body: [
      { kind: 'p', text: 'A client leaving before the end of their programme is a discharge. The steps are the same as a graduation, but the type you choose is different.' },
      { kind: 'table', head: ['Type', 'When to use it'], rows: [
        ['Early discharge', 'They left before completing their programme.'],
        ['Transfer',        'They moved to another centre or service.'],
        ['Other',           'Anything the three above do not cover — say why in the notes.'],
      ] },
      { kind: 'steps', items: [
        'Open the client and find the discharge panel.',
        'Choose the type that matches what happened.',
        'Add a short note explaining the circumstances.',
        'Submit, then have it approved and finalised as with a graduation.',
      ] },
      { kind: 'warn', text: 'Early discharges are counted separately on the Overview and group hub, because they mean something different to a graduation. Choosing the right type matters for the numbers to be worth anything.' },
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
        ['Where',      'In the client’s file.',           'The Incident reports screen, or from the client.'],
        ['Effect',     'Amber stripe on their card.',         'Counted on the Overview and group hub for seven days.'],
        ['Use it when','You want the next shift to be aware.','There has been an actual event needing a record.'],
      ] },
      { kind: 'note', text: 'If you are unsure which to use, raise a concern — it is quick, and it can always be escalated into a formal report.' },
    ],
  },
  {
    id: 'incidents-create',
    category: 'concerns',
    title: 'How do I file a formal incident report?',
    summary: 'Go to Incident reports in the left menu, or open the client and use the incident section in their file.',
    keywords: ['incident', 'report', 'file', 'formal', 'record', 'accident', 'event', 'serious', 'document', 'create incident', 'new incident', 'log incident'],
    body: [
      { kind: 'steps', items: [
        'Click "Incident reports" in the left menu.',
        'Click the button to create a new report.',
        'Fill in the date, time, type of incident, what happened, and who was involved.',
        'Save. It is immediately visible to anyone who has access to the Incident reports screen.',
      ] },
      { kind: 'p', text: 'You can also start a report directly from a client\'s file — open them and find the incident section there. Their details pre-fill automatically so you do not have to type them.' },
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
      { kind: 'p', text: 'Everything meaningful is recorded automatically — completing a task, reopening one, admitting a client, approving a discharge, changing a permission. You never have to remember to log anything.' },
      { kind: 'note', text: 'Viewing the Activity log needs the "view audit" permission.' },
    ],
  },

  /* ───────────────────────── Administration ───────────────────────── */
  {
    id: 'admin-staff',
    category: 'admin',
    title: 'How do I manage staff and their permissions?',
    summary: 'Administration → Staff & permissions, and System access for logins.',
    keywords: ['staff', 'users', 'permissions', 'roles', 'add user', 'invite', 'access', 'remove someone', 'new starter'],
    body: [
      { kind: 'p', text: 'The Administration screen has three tabs:' },
      { kind: 'table', head: ['Tab', 'What it does'], rows: [
        ['Staff & permissions', 'Who works at this centre and what each of them may do.'],
        ['Rooms & beds',        'The physical layout — see the next article.'],
        ['System access',       'Logins, roles and invitations for the tool itself.'],
      ] },
      { kind: 'note', text: 'This whole screen needs the "manage users" permission, so it will not appear in your menu unless you hold it.' },
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
        ['Graduate',            'A client finishing their programme as planned. The good outcome.'],
        ['Discharge',           'A client leaving before finishing — early, transferred, or otherwise unplanned.'],
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
        ['✓ green tick',     'Treatment board', 'Task done.'],
        ['▲ red triangle',   'Treatment board', 'Task overdue.'],
        ['● amber dot',      'Treatment board', 'Task due today.'],
        ['— grey dash',      'Treatment board', 'Not due yet, or module not selected.'],
        ['Red number badge',      'Bed card corner',  'How many things need attention for that client.'],
        ['Red "?" on photo',      'Bed card',         'No photograph on file.'],
        ['Green "✓" on photo','Bed card',        'Photograph on file.'],
        ['⚑ red flag',       'Bed card',         'Restricted alert — speak to the centre manager.'],
        ['Red top stripe',        'Bed card',         'Restricted alert on this client.'],
        ['Amber top stripe',      'Bed card',         'An open concern.'],
        ['Teal top stripe',       'Bed card',         'Approved extension.'],
        ['"+Nd ext."',            'Bed card',         'Stay extended by N days.'],
        ['"shared"',              'Bed label',        'One of two beds in that room.'],
        ['▲/●/✓ purple chip',    'Treatment board (Extra column)', 'Status of all custom assignments for that client — red triangle = overdue, amber dot = due today, green tick = all done.'],
        ['✎ Custom chip',        'Client task list', 'This task was added manually, not from the standard template. It can be deleted.'],
      ] },
    ],
  },
];
