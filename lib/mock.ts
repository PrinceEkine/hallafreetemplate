export type Announcement = {
  id: string;
  title: string;
  body: string;
  date: string;
  time: string;
  createdAt?: string;
  postId?: string | null;
  edited?: boolean;
  adminsOnly?: boolean;
  images?: string[];
};

export type ChatPreview = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  preview: string;
  time: string;
  unread: number;
  fav: boolean;
};

export type Post = {
  id: string;
  title?: string;
  createdAt?: string;
  author: string;
  authorAvatar?: string | null;
  handle: string;
  time: string;
  text: string;
  likes: string;
  reposts: string;
  comments: string;
  shares: string;
  color: string;
  imageUrl?: string;
  images?: string[];
  videos?: string[];
  files?: { uri: string; name: string; size: number }[];
  edited?: boolean;
};

export type Team = {
  id: string;
  name: string;
  description: string;
  time: string;
  unread: number;
  joined?: boolean;
};

export type EventItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  highlight: boolean;
  isoDate?: string;
  bannerUrl?: string;
  bannerKind?: 'image' | 'video';
};

export const announcements: Announcement[] = [
  {
    id: '1',
    title: 'Q3 All-Hands Meeting',
    body: 'This is to announce that all staff must attend the quarterly all-hands meeting. Attendance will be taken at the venue before 9am prompt.',
    date: '28TH JULY 2025',
    time: '9:00 AM',
  },
  {
    id: '2',
    title: 'Security Alert',
    body: 'All staff must stay vigilant and report any threat around them to the nearest authority, including but not limited to their line managers.',
    date: '24TH JUNE 2025',
    time: '2:30 PM',
  },
  {
    id: '3',
    title: 'CEO Charges Staff on Self Reliance',
    body: 'This is to announce that, there has been a change in the welfare policy for all departments going forward.',
    date: '24TH MARCH 2025',
    time: '11:15 AM',
  },
  {
    id: '4',
    title: 'Company Committed to Tech-Driven Growth',
    body: 'The CEO has reiterated the company’s commitment to deploying more ICT tools to enhance its mobilisation process.',
    date: '24TH MARCH 2025',
    time: '4:45 PM',
  },
  {
    id: '5',
    title: 'Management Increases Staff Allowance',
    body: 'Management has increased staff allowance. This was announced yesterday by the CEO at the town hall.',
    date: '24TH MARCH 2025',
    time: '10:00 AM',
  },
];

export const chats: ChatPreview[] = [
  { id: '1', name: 'HR SUPPORT', preview: 'Welcome to staff assistance chat, am ask to…', time: '7:30', unread: 1, fav: true },
  { id: '2', name: 'OPHIXE AI', preview: 'AI Support', time: '7:30', unread: 1, fav: true },
  { id: '3', name: 'ADAeze O.', preview: 'Hmmmm', time: '7:30', unread: 1, fav: false },
  { id: '4', name: 'IDRIS YUSUF', preview: 'I called yesterday', time: '7:30', unread: 3, fav: false },
  { id: '5', name: 'TAIYE ADEBAYO', preview: 'say hi to kenny for me', time: '7:30', unread: 0, fav: false },
  { id: '6', name: 'CHIOMA GOZIE', preview: 'Happy birthday in advance dear', time: '7:30', unread: 0, fav: true },
  { id: '7', name: 'GRACE OKON', preview: 'My baby is saying Hi', time: '7:30', unread: 2, fav: false },
  { id: '8', name: 'MICHEAL MUHAMMED', preview: 'Love in the Air', time: '7:30', unread: 0, fav: false },
];

export const posts: Post[] = [
  {
    id: '1',
    title: 'Happy birthday to my sweetheart',
    author: 'ANGEL OMOLOLA',
    handle: 'Celebrate Her Birthday with friends & loved ones',
    time: '2h',
    text: 'Today I wish and my sweetheart a happy birth day, we met each other at work and it has been a wonderful journey together',
    likes: '14008',
    reposts: '37288',
    comments: '5700',
    shares: '3664',
    color: '#0E7A3D',
  },
  {
    id: '2',
    title: 'End of year party throwback',
    author: 'KEMI BISI',
    handle: 'shares her memory',
    time: '5h',
    text: 'Throwback to our end of year party. What a team!',
    likes: '2.1k',
    reposts: '340',
    comments: '890',
    shares: '112',
    color: '#000000',
  },
];

export const teams: Team[] = [
  { id: '1', name: 'IKEJA BRANCH', description: 'Ikeja staff members only', time: '9:30', unread: 1 },
  { id: '2', name: 'SDGS', description: 'SDGS Team Members', time: '7:30', unread: 1 },
  { id: '3', name: 'LAGOS STAFF', description: 'Batch B 2025', time: '7:30', unread: 2 },
  { id: '4', name: 'PROJECT SENSITIZATION', description: 'Create for the sensitization project', time: '7:30', unread: 3 },
  { id: '5', name: 'SOFTWARE DEV TRAINING', description: 'Software dev training platform', time: '7:30', unread: 1 },
  { id: '6', name: 'OPERATIONS', description: 'Staff posted to operations', time: '7:30', unread: 1 },
  { id: '7', name: 'RED CROSS PLATFORM', description: 'Emergency group for medical support', time: '7:30', unread: 1 },
  { id: '8', name: 'MEDIA TEAM', description: 'Press Team - Report news here', time: '7:30', unread: 2 },
];

export const weekDays = [
  { day: 'Fri', date: '1' },
  { day: 'Sat', date: '2' },
  { day: 'Sun', date: '3' },
  { day: 'Mon', date: '4' },
  { day: 'Tue', date: '5' },
  { day: 'Wed', date: '6' },
  { day: 'Thu', date: '7' },
];

export const events: EventItem[] = [
  { id: '1', title: 'ANNUAL STAFF CONFERENCE', date: '14TH AUGUST 2025', time: '10:30 AM', highlight: true },
  { id: '2', title: 'SOFTWARE DEV CLASS', date: '20TH AUGUST 2025', time: '1:00 PM', highlight: false },
  { id: '3', title: 'CEO ADDRESS FOR 51ST ANNIVERSARY', date: '24TH AUGUST 2025', time: '8:00 AM', highlight: false },
  { id: '4', title: 'STAFF SECURITY SEMINAR', date: '25TH AUGUST 2025', time: '12:00 PM', highlight: false },
];
