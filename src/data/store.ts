import type {
  Announcement,
  ChatThread,
  Community,
  CommunityModuleId,
  DueItem,
  EventItem,
  FormLink,
  FormSubmission,
  FormType,
  MeetingRoom,
  MemberEntry,
  NotificationItem,
  PersonalTodo,
  PollItem,
  Post,
  TaskItem,
  TransferClaim,
} from '../types';

export const COMMUNITY_MODULES: {
  id: CommunityModuleId;
  label: string;
  blurb: string;
}[] = [
  { id: 'directory', label: 'DIRECTORY', blurb: 'Member list and profiles' },
  { id: 'actions', label: 'MEETING', blurb: 'Meeting rooms and calls' },
  { id: 'task', label: 'TASK', blurb: 'Tasks and assignments' },
  { id: 'forms', label: 'FORMS', blurb: 'Staff requests and forms' },
  { id: 'media', label: 'MEDIA', blurb: 'Photos and videos' },
  { id: 'files', label: 'FILES', blurb: 'Shared files and docs' },
  { id: 'approval', label: 'APPROVAL', blurb: 'Approvals inbox' },
  { id: 'polls', label: 'POLLS', blurb: 'Polls and votes' },
  { id: 'pay', label: 'PAY', blurb: 'Dues and wallet' },
  { id: 'project', label: 'PROJECT', blurb: 'Projects and tracking' },
  { id: 'contact', label: 'CONTACT', blurb: 'Contact and support' },
];

export const STICKERS = [
  { id: 'thumbs-up', label: 'Thumbs up', src: '/assets/stickers/thumbs-up.png' },
  { id: 'heart', label: 'Heart', src: '/assets/stickers/heart.png' },
  { id: 'fire', label: 'Fire', src: '/assets/stickers/fire.png' },
  { id: 'clap', label: 'Clap', src: '/assets/stickers/clap.png' },
  { id: 'laugh', label: 'Laugh', src: '/assets/stickers/laugh.png' },
  { id: 'party', label: 'Party', src: '/assets/stickers/party.png' },
  { id: 'cool', label: 'Cool', src: '/assets/stickers/cool.png' },
  { id: 'love', label: 'Love', src: '/assets/stickers/love.png' },
  { id: 'smile', label: 'Smile', src: '/assets/stickers/smile.png' },
  { id: 'star', label: 'Star', src: '/assets/stickers/star.png' },
  { id: 'thinking', label: 'Thinking', src: '/assets/stickers/thinking.png' },
  { id: 'wink', label: 'Wink', src: '/assets/stickers/wink.png' },
];

export const FORM_TYPES: { id: FormType; title: string }[] = [
  { id: 'data_correction', title: 'Data Correction' },
  { id: 'leave_request', title: 'Leave Request' },
  { id: 'payment_issue', title: 'Payment Issue' },
  { id: 'query_response', title: 'Query Response' },
  { id: 'staff_report', title: 'Report Staff' },
];

export type FormFieldDef = {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'select' | 'date';
  options?: string[];
  required?: boolean;
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const FORM_DEFS: Record<FormType, FormFieldDef[]> = {
  data_correction: [
    {
      key: 'type',
      label: 'TYPE',
      kind: 'select',
      options: ['Name (Both)', 'Name (Surname)', 'Name (First)', 'Date of Birth', 'State'],
      required: true,
    },
    {
      key: 'reason',
      label: 'REASON',
      kind: 'select',
      options: ['Mistake', 'Omission', 'Update'],
      required: true,
    },
    { key: 'from', label: 'FROM', kind: 'text', required: true },
    { key: 'to', label: 'TO', kind: 'text', required: true },
    { key: 'justification', label: 'JUSTIFICATION', kind: 'textarea', required: true },
  ],
  leave_request: [
    {
      key: 'leave_type',
      label: 'LEAVE TYPE',
      kind: 'select',
      options: ['Annual Leave', 'Health Leave', 'Emergency Leave', 'Official Duty'],
      required: true,
    },
    { key: 'from_date', label: 'FROM (DATE)', kind: 'date', required: true },
    { key: 'till_date', label: 'TILL (DATE)', kind: 'date', required: true },
    { key: 'reason', label: 'REASON', kind: 'textarea', required: true },
    { key: 'contact', label: 'CONTACT WHILE AWAY', kind: 'text' },
  ],
  payment_issue: [
    {
      key: 'type',
      label: 'TYPE',
      kind: 'select',
      options: ['Unpaid', 'Short Pay', 'Wrong Account'],
      required: true,
    },
    { key: 'month', label: 'MONTH', kind: 'select', options: MONTHS, required: true },
    {
      key: 'queried',
      label: 'QUERIED',
      kind: 'select',
      options: ['No', 'Yes'],
      required: true,
    },
    { key: 'justification', label: 'JUSTIFICATION', kind: 'textarea', required: true },
  ],
  query_response: [
    {
      key: 'query',
      label: 'QUERY',
      kind: 'select',
      options: ['Missed Meeting', 'Missed Deadline', 'Misconduct', 'Absence'],
      required: true,
    },
    {
      key: 'why',
      label: 'WHY',
      kind: 'select',
      options: ['Medical Emergency', 'Family Emergency', 'Official Duty', 'Other'],
      required: true,
    },
    { key: 'issue_date', label: 'ISSUE DATE', kind: 'date', required: true },
    { key: 'explanation', label: 'EXPLANATION', kind: 'textarea', required: true },
  ],
  staff_report: [
    { key: 'staff_name', label: 'STAFF NAME', kind: 'text', required: true },
    {
      key: 'behaviour',
      label: 'REASON',
      kind: 'select',
      options: [
        'Sexual harassment',
        'Harsh / abusive behaviour',
        'Bullying / intimidation',
        'Discrimination',
        'Rudeness to staff or clients',
        'Negligence of duty',
      ],
      required: true,
    },
    { key: 'details', label: 'DETAILS', kind: 'textarea', required: true },
  ],
};

function todayIsoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatEventDate(iso: string): string {
  const months = [
    'JANUARY',
    'FEBRUARY',
    'MARCH',
    'APRIL',
    'MAY',
    'JUNE',
    'JULY',
    'AUGUST',
    'SEPTEMBER',
    'OCTOBER',
    'NOVEMBER',
    'DECEMBER',
  ];
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
  const day = d.getDate();
  const suffix =
    day === 1 || day === 21 || day === 31
      ? 'ST'
      : day === 2 || day === 22
        ? 'ND'
        : day === 3 || day === 23
          ? 'RD'
          : 'TH';
  return `${day}${suffix} ${months[d.getMonth()] ?? ''} ${d.getFullYear()}`;
}

export function formatNaira(kobo: number): string {
  return `₦${Math.floor(kobo / 100).toLocaleString()}`;
}

const ALL_MODULES_ON: Record<CommunityModuleId, boolean> = {
  directory: true,
  actions: true,
  task: true,
  forms: true,
  media: true,
  files: true,
  approval: true,
  polls: true,
  pay: true,
  project: true,
  contact: true,
};

export type AppState = {
  signedIn: boolean;
  userName: string;
  userRole: 'admin' | 'staff';
  selectedCommunityId: string;
  communities: Community[];
  announcements: Announcement[];
  posts: Post[];
  threads: ChatThread[];
  events: EventItem[];
  personalTodos: PersonalTodo[];
  tasks: TaskItem[];
  polls: PollItem[];
  submissions: FormSubmission[];
  formLinks: FormLink[];
  dues: DueItem[];
  claims: TransferClaim[];
  members: Record<string, MemberEntry[]>;
  meetings: MeetingRoom[];
  notifications: NotificationItem[];
};

export function createInitialState(): AppState {
  const today = todayIsoOffset(0);
  const plus2 = todayIsoOffset(2);
  const plus5 = todayIsoOffset(5);
  const plus9 = todayIsoOffset(9);

  return {
    signedIn: true,
    userName: 'Adaeze O.',
    userRole: 'admin',
    selectedCommunityId: 'comm-hq',
    communities: [
      {
        id: 'comm-hq',
        name: 'Ophixe HQ',
        description: 'Main company workspace for staff announcements, chat, tasks, and dues.',
        inviteCode: 'OPHIXE-HQ-2026',
        pinned: true,
        unread: true,
        accountNumber: '0128492011',
        accountName: 'Ophixe Staff Welfare Assoc.',
        bankName: 'GTBank',
        modules: { ...ALL_MODULES_ON },
      },
      {
        id: 'comm-ikeja',
        name: 'Ikeja Branch',
        description: 'Ikeja operations, field staff, and branch updates.',
        inviteCode: 'IKEJA-BR-2026',
        pinned: false,
        unread: false,
        accountNumber: '2049811204',
        accountName: 'Ophixe Ikeja Chapter',
        bankName: 'Zenith Bank',
        modules: { ...ALL_MODULES_ON },
      },
    ],
    announcements: [
      {
        id: 'ann-1',
        communityId: 'comm-hq',
        title: 'Q4 All-Hands Meeting',
        body: 'This is to announce that all staff must attend the quarterly all-hands meeting. Attendance will be taken at the venue before 9am prompt.',
        date: formatEventDate(plus2),
        time: '9:00 AM',
        createdAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
      },
      {
        id: 'ann-2',
        communityId: 'comm-hq',
        title: 'Security Alert',
        body: 'All staff must stay vigilant and report any threat around them to the nearest authority, including but not limited to their line managers.',
        date: formatEventDate(today),
        time: '2:30 PM',
        createdAt: new Date(Date.now() - 3600 * 1000 * 8).toISOString(),
      },
      {
        id: 'ann-3',
        communityId: 'comm-hq',
        title: 'Management Increases Staff Allowance',
        body: 'Management has increased staff allowance. This was announced yesterday by the CEO at the town hall. HR will circulate updated payroll schedules this Friday.',
        date: formatEventDate(todayIsoOffset(-2)),
        time: '10:00 AM',
        createdAt: new Date(Date.now() - 3600 * 1000 * 26).toISOString(),
        adminsOnly: false,
      },
      {
        id: 'ann-4',
        communityId: 'comm-hq',
        title: 'Admin Leadership Review',
        body: 'Department leads should submit Q4 staffing headcount requests before Thursday noon via the Forms module.',
        date: formatEventDate(todayIsoOffset(-4)),
        time: '4:45 PM',
        createdAt: new Date(Date.now() - 3600 * 1000 * 50).toISOString(),
        adminsOnly: true,
      },
      {
        id: 'ann-5',
        communityId: 'comm-ikeja',
        title: 'Ikeja Branch Safety Briefing',
        body: 'Mandatory fire-drill briefing at the Ikeja annex courtyard tomorrow at 8:30 AM.',
        date: formatEventDate(today),
        time: '8:30 AM',
        createdAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
      },
    ],
    posts: [
      {
        id: 'post-1',
        communityId: 'comm-hq',
        title: 'Happy birthday to my sweetheart',
        author: 'ANGEL OMOLOLA',
        handle: 'Ophixe HQ • 2h',
        time: '2h',
        createdAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
        text: 'Today I wish my sweetheart a happy birthday! We met each other at work and it has been a wonderful journey together.',
        likes: 148,
        reposts: 32,
        commentsCount: 2,
        shares: 14,
        color: '#0E7A3D',
        likedByMe: false,
        savedByMe: true,
        taggedMe: true,
        commentsList: [
          { id: 'c1', author: 'Chioma Gozie', text: 'Happy birthday in advance dear!', time: '1h' },
          { id: 'c2', author: 'Idris Yusuf', text: 'Wishing you both the very best!', time: '42m' },
        ],
      },
      {
        id: 'post-2',
        communityId: 'comm-hq',
        title: 'End of year party throwback',
        author: 'KEMI BISI',
        handle: 'Ophixe HQ • 5h',
        time: '5h',
        createdAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
        text: 'Throwback to our end of year party. What a team! Who is ready for this year’s celebration?',
        likes: 94,
        reposts: 12,
        commentsCount: 1,
        shares: 6,
        color: '#1C1C1E',
        likedByMe: true,
        savedByMe: false,
        commentsList: [
          { id: 'c3', author: 'Taiye Adebayo', text: 'Best night of the year!', time: '3h' },
        ],
      },
      {
        id: 'post-3',
        communityId: 'comm-ikeja',
        title: 'Ikeja Logistics Milestone',
        author: 'TAIYE ADEBAYO',
        handle: 'Ikeja Branch • 1d',
        time: '1d',
        createdAt: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
        text: '100% on-time dispatch across all Lagos zones this week. Huge shoutout to the operations crew!',
        likes: 63,
        reposts: 9,
        commentsCount: 0,
        shares: 4,
        color: '#000000',
        commentsList: [],
      },
    ],
    threads: [
      {
        id: 'dm-1',
        communityId: 'comm-hq',
        name: 'HR SUPPORT',
        preview: 'Welcome to staff assistance chat, how can we help?',
        time: '9:30 AM',
        unread: 1,
        fav: true,
        isGroup: false,
        online: true,
        disappearSeconds: 0,
        messages: [
          {
            id: 'm1',
            senderId: 'hr',
            senderName: 'HR SUPPORT',
            text: 'Welcome to staff assistance chat! Let us know if you need help with leave requests or payroll.',
            time: '9:28 AM',
          },
          {
            id: 'm2',
            senderId: 'me',
            senderName: 'Adaeze O.',
            text: 'Thanks! Just checking if the Q4 welfare allowance form is live.',
            time: '9:29 AM',
          },
          {
            id: 'm3',
            senderId: 'hr',
            senderName: 'HR SUPPORT',
            text: 'Yes, you can submit it right from the Forms module in the menu.',
            time: '9:30 AM',
            reactions: [{ emoji: '👍', byMe: true, count: 1 }],
          },
        ],
      },
      {
        id: 'dm-2',
        communityId: 'comm-hq',
        name: 'IDRIS YUSUF',
        preview: 'Did you get the all-hands deck?',
        time: '8:15 AM',
        unread: 2,
        fav: false,
        isGroup: false,
        online: true,
        disappearSeconds: 86400,
        messages: [
          {
            id: 'm4',
            senderId: 'idris',
            senderName: 'IDRIS YUSUF',
            text: 'Hey Adaeze, did you get the all-hands deck?',
            time: '8:14 AM',
          },
          {
            id: 'm5',
            senderId: 'idris',
            senderName: 'IDRIS YUSUF',
            text: 'Operations updated slide 6 with the new Q4 targets.',
            time: '8:15 AM',
          },
        ],
      },
      {
        id: 'dm-3',
        communityId: 'comm-hq',
        name: 'CHIOMA GOZIE',
        preview: 'Happy birthday in advance dear',
        time: 'Yesterday',
        unread: 0,
        fav: true,
        isGroup: false,
        online: false,
        messages: [
          {
            id: 'm6',
            senderId: 'chioma',
            senderName: 'CHIOMA GOZIE',
            text: 'Happy birthday in advance dear!',
            time: 'Yesterday',
          },
        ],
      },
      {
        id: 'dm-4',
        communityId: 'comm-hq',
        name: 'TAIYE ADEBAYO',
        preview: 'Say hi to Kenny for me',
        time: 'Yesterday',
        unread: 0,
        fav: false,
        isGroup: false,
        online: false,
        messages: [
          {
            id: 'm7',
            senderId: 'taiye',
            senderName: 'TAIYE ADEBAYO',
            text: 'Say hi to Kenny for me when you stop by Ikeja.',
            time: 'Yesterday',
          },
        ],
      },
      {
        id: 'grp-1',
        communityId: 'comm-hq',
        name: 'OPERATIONS',
        preview: 'Staff posted to operations — morning standup at 9am',
        time: '9:10 AM',
        unread: 1,
        fav: false,
        isGroup: true,
        joined: true,
        description: 'Staff posted to operations',
        messages: [
          {
            id: 'gm1',
            senderId: 'idris',
            senderName: 'Idris Yusuf',
            text: 'Morning team! Morning standup kicks off in Meeting Room 1 at 9:00 AM.',
            time: '9:10 AM',
          },
        ],
      },
      {
        id: 'grp-2',
        communityId: 'comm-hq',
        name: 'SOFTWARE DEV TRAINING',
        preview: 'Software dev training platform',
        time: 'Yesterday',
        unread: 0,
        fav: false,
        isGroup: true,
        joined: true,
        description: 'Software dev training platform',
        messages: [
          {
            id: 'gm2',
            senderId: 'kemi',
            senderName: 'Kemi Bisi',
            text: 'TypeScript & React workshop slides are uploaded in Files.',
            time: 'Yesterday',
          },
        ],
      },
      {
        id: 'grp-3',
        communityId: 'comm-hq',
        name: 'MEDIA TEAM',
        preview: 'Press Team - Report news here',
        time: '2d',
        unread: 0,
        fav: false,
        isGroup: true,
        joined: false,
        description: 'Press Team - Report news here',
        messages: [
          {
            id: 'gm3',
            senderId: 'angel',
            senderName: 'Angel Omolola',
            text: 'Share event photos from the branch launches here.',
            time: '2d',
          },
        ],
      },
      {
        id: 'grp-4',
        communityId: 'comm-hq',
        name: 'RED CROSS PLATFORM',
        preview: 'Emergency group for medical support',
        time: '3d',
        unread: 0,
        fav: false,
        isGroup: true,
        joined: false,
        description: 'Emergency group for medical support',
        messages: [],
      },
      {
        id: 'grp-5',
        communityId: 'comm-ikeja',
        name: 'IKEJA BRANCH',
        preview: 'Ikeja staff members only',
        time: '9:30 AM',
        unread: 1,
        fav: false,
        isGroup: true,
        joined: true,
        description: 'Ikeja staff members only',
        messages: [
          {
            id: 'gm4',
            senderId: 'taiye',
            senderName: 'Taiye Adebayo',
            text: 'Welcome to the Ikeja Branch team channel.',
            time: '9:30 AM',
          },
        ],
      },
    ],
    events: [
      {
        id: 'ev-1',
        communityId: 'comm-hq',
        title: 'ANNUAL STAFF CONFERENCE',
        date: formatEventDate(today),
        time: '10:30 AM',
        isoDate: today,
        highlight: true,
        location: 'Main Auditorium, Lagos HQ',
        description: 'Company-wide annual conference covering product roadmap, staff welfare updates, and department awards.',
      },
      {
        id: 'ev-2',
        communityId: 'comm-hq',
        title: 'SOFTWARE DEV CLASS',
        date: formatEventDate(plus2),
        time: '1:00 PM',
        isoDate: plus2,
        highlight: false,
        location: 'Training Room B',
        description: 'Hands-on session on modern web tooling and internal APIs.',
      },
      {
        id: 'ev-3',
        communityId: 'comm-hq',
        title: 'CEO ADDRESS FOR 51ST ANNIVERSARY',
        date: formatEventDate(plus5),
        time: '8:00 AM',
        isoDate: plus5,
        highlight: false,
        location: 'Grand Hall & Livestream',
        description: 'Special anniversary address from the CEO with live Q&A.',
      },
      {
        id: 'ev-4',
        communityId: 'comm-hq',
        title: 'STAFF SECURITY SEMINAR',
        date: formatEventDate(plus9),
        time: '12:00 PM',
        isoDate: plus9,
        highlight: false,
        location: 'Conference Room 2',
        description: 'Workplace safety and information security best practices.',
      },
    ],
    personalTodos: [
      {
        id: 'todo-1',
        title: 'Review Q4 department budget sheet',
        eventDate: today,
        eventTime: '4:00 PM',
        done: false,
      },
      {
        id: 'todo-2',
        title: 'Confirm Ikeja travel roster',
        eventDate: plus2,
        eventTime: '11:00 AM',
        done: false,
      },
    ],
    tasks: [
      {
        id: 'task-1',
        communityId: 'comm-hq',
        title: 'Prepare Q4 All-Hands Slides',
        detail: 'Consolidate operations, engineering, and HR updates into one deck.',
        status: 'in_progress',
        dueDate: plus2,
        assigneeNames: ['Adaeze O.', 'Idris Yusuf'],
        createdAt: '2h ago',
      },
      {
        id: 'task-2',
        communityId: 'comm-hq',
        title: 'Audit Branch Contact Directory',
        detail: 'Ensure all new hires have phone and email verified in Directory.',
        status: 'open',
        dueDate: plus5,
        assigneeNames: ['Chioma Gozie'],
        createdAt: '1d ago',
      },
      {
        id: 'task-3',
        communityId: 'comm-hq',
        title: 'Publish October Welfare Report',
        detail: 'Upload signed welfare disbursement PDF to Files.',
        status: 'done',
        dueDate: today,
        assigneeNames: ['Kemi Bisi'],
        createdAt: '3d ago',
      },
    ],
    polls: [
      {
        id: 'poll-1',
        communityId: 'comm-hq',
        question: 'Which day works best for the End-of-Year Staff Retreat?',
        closed: false,
        votedOptionId: null,
        createdAt: '3h ago',
        options: [
          { id: 'opt-1', label: 'Friday, Dec 12', votes: 18 },
          { id: 'opt-2', label: 'Saturday, Dec 13', votes: 27 },
          { id: 'opt-3', label: 'Friday, Dec 19', votes: 9 },
        ],
      },
      {
        id: 'poll-2',
        communityId: 'comm-hq',
        question: 'Preferred lunch catering for All-Hands?',
        closed: true,
        votedOptionId: 'opt-4',
        createdAt: '4d ago',
        options: [
          { id: 'opt-4', label: 'Jollof & Grilled Chicken', votes: 42 },
          { id: 'opt-5', label: 'Continental Buffet', votes: 16 },
        ],
      },
    ],
    submissions: [
      {
        id: 'sub-1',
        communityId: 'comm-hq',
        type: 'leave_request',
        typeTitle: 'Leave Request',
        submitterName: 'Adaeze O.',
        status: 'pending',
        createdAt: '4h ago',
        fields: {
          leave_type: 'Annual Leave',
          from_date: plus5,
          till_date: plus9,
          reason: 'Family travel out of state.',
        },
      },
      {
        id: 'sub-2',
        communityId: 'comm-hq',
        type: 'data_correction',
        typeTitle: 'Data Correction',
        submitterName: 'Idris Yusuf',
        status: 'approved',
        createdAt: '2d ago',
        fields: {
          type: 'Name (First)',
          reason: 'Mistake',
          from: 'Idriss',
          to: 'Idris',
          justification: 'Correct spelling to match NIN record.',
        },
      },
    ],
    formLinks: [
      {
        id: 'fl-1',
        communityId: 'comm-hq',
        title: 'Annual Staff Satisfaction Survey',
        url: 'https://forms.gle/ophixe-staff-survey',
      },
    ],
    dues: [
      {
        id: 'due-1',
        communityId: 'comm-hq',
        title: 'November Staff Welfare Due',
        amountKobo: 500000,
        paid: false,
        claimed: false,
        payers: ['Kemi Bisi', 'Taiye Adebayo', 'Chioma Gozie'],
      },
      {
        id: 'due-2',
        communityId: 'comm-hq',
        title: 'End-of-Year Retreat Contribution',
        amountKobo: 1000000,
        paid: true,
        claimed: false,
        payers: ['Adaeze O.', 'Idris Yusuf', 'Kemi Bisi'],
      },
    ],
    claims: [
      {
        id: 'claim-1',
        communityId: 'comm-hq',
        dueId: 'due-1',
        dueTitle: 'November Staff Welfare Due',
        memberName: 'Idris Yusuf',
        amountKobo: 500000,
        createdAt: '1h ago',
      },
    ],
    members: {
      'comm-hq': [
        { userId: 'me', name: 'Adaeze O.', role: 'owner', tag: 'Product Lead', email: 'adaeze@ophixe.com', phone: '+234 803 000 1001' },
        { userId: 'idris', name: 'Idris Yusuf', role: 'admin', tag: 'Operations', email: 'idris@ophixe.com', phone: '+234 803 000 1002' },
        { userId: 'kemi', name: 'Kemi Bisi', role: 'admin', tag: 'People & HR', email: 'kemi@ophixe.com', phone: '+234 803 000 1003' },
        { userId: 'chioma', name: 'Chioma Gozie', role: 'staff', tag: 'Finance', email: 'chioma@ophixe.com', phone: '+234 803 000 1004' },
        { userId: 'taiye', name: 'Taiye Adebayo', role: 'staff', tag: 'Logistics', email: 'taiye@ophixe.com', phone: '+234 803 000 1005' },
        { userId: 'angel', name: 'Angel Omolola', role: 'staff', tag: 'Comms', email: 'angel@ophixe.com', phone: '+234 803 000 1006' },
      ],
      'comm-ikeja': [
        { userId: 'me', name: 'Adaeze O.', role: 'admin', tag: 'HQ Liaison', email: 'adaeze@ophixe.com', phone: '+234 803 000 1001' },
        { userId: 'taiye', name: 'Taiye Adebayo', role: 'owner', tag: 'Branch Lead', email: 'taiye@ophixe.com', phone: '+234 803 000 1005' },
      ],
    },
    meetings: [
      { id: 'mt-1', communityId: 'comm-hq', name: 'Meeting Room 1', kind: 'room', live: true, participants: 4 },
      { id: 'mt-2', communityId: 'comm-hq', name: 'Meeting Room 2', kind: 'room', live: false, participants: 0 },
      { id: 'mt-3', communityId: 'comm-hq', name: 'Management Meeting Room', kind: 'management', live: false, participants: 0 },
      { id: 'mt-4', communityId: 'comm-hq', name: 'Podcast Radio', kind: 'podcast', live: false, participants: 0 },
    ],
    notifications: [
      {
        id: 'n1',
        title: 'New Announcement',
        body: 'Q4 All-Hands Meeting posted in Ophixe HQ.',
        time: '2h ago',
        read: false,
        targetTab: 'update',
      },
      {
        id: 'n2',
        title: 'Transfer Claim Pending',
        body: 'Idris Yusuf marked November Staff Welfare Due as paid.',
        time: '1h ago',
        read: false,
        targetModule: 'pay',
      },
      {
        id: 'n3',
        title: 'You were tagged in a post',
        body: 'Angel Omolola mentioned you in "Happy birthday to my sweetheart".',
        time: '2h ago',
        read: true,
        targetTab: 'feed',
      },
    ],
  };
}

const STORAGE_KEY = '@ophixe_web_state_v1';

export function loadAppState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const base = createInitialState();
    return {
      ...base,
      ...parsed,
      communities: parsed.communities?.length ? parsed.communities : base.communities,
    };
  } catch {
    return createInitialState();
  }
}

export function saveAppState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}
