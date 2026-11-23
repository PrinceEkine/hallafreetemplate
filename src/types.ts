export type ThemeName = 'light' | 'dark';

export type CommunityModuleId =
  | 'directory'
  | 'actions'
  | 'task'
  | 'forms'
  | 'media'
  | 'files'
  | 'approval'
  | 'polls'
  | 'pay'
  | 'project'
  | 'contact';

export type Community = {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  pinned?: boolean;
  unread?: boolean;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  modules: Record<CommunityModuleId, boolean>;
};

export type Announcement = {
  id: string;
  communityId: string;
  title: string;
  body: string;
  date: string;
  time: string;
  createdAt: string;
  edited?: boolean;
  adminsOnly?: boolean;
};

export type PostComment = {
  id: string;
  author: string;
  text: string;
  time: string;
};

export type Post = {
  id: string;
  communityId: string;
  title?: string;
  author: string;
  handle: string;
  time: string;
  createdAt: string;
  text: string;
  likes: number;
  reposts: number;
  commentsCount: number;
  shares: number;
  color?: string;
  imageUrl?: string;
  edited?: boolean;
  likedByMe?: boolean;
  savedByMe?: boolean;
  taggedMe?: boolean;
  isMine?: boolean;
  commentsList: PostComment[];
};

export type ChatReaction = {
  emoji: string;
  byMe: boolean;
  count: number;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string;
  sticker?: string;
  replyTo?: { senderName: string; text: string };
  edited?: boolean;
  reactions?: ChatReaction[];
};

export type ChatThread = {
  id: string;
  communityId: string | null;
  name: string;
  preview: string;
  time: string;
  unread: number;
  fav: boolean;
  isGroup: boolean;
  joined?: boolean;
  description?: string;
  online?: boolean;
  disappearSeconds?: number;
  messages: ChatMessage[];
};

export type EventItem = {
  id: string;
  communityId: string;
  title: string;
  date: string;
  time: string;
  isoDate: string;
  highlight: boolean;
  description?: string;
  location?: string;
};

export type PersonalTodo = {
  id: string;
  title: string;
  eventDate: string;
  eventTime?: string;
  done: boolean;
};

export type TaskStatus = 'open' | 'in_progress' | 'done';

export type TaskItem = {
  id: string;
  communityId: string;
  title: string;
  detail: string;
  status: TaskStatus;
  dueDate?: string;
  assigneeNames: string[];
  createdAt: string;
};

export type PollOption = {
  id: string;
  label: string;
  votes: number;
};

export type PollItem = {
  id: string;
  communityId: string;
  question: string;
  closed: boolean;
  votedOptionId: string | null;
  createdAt: string;
  options: PollOption[];
};

export type FormType =
  | 'data_correction'
  | 'leave_request'
  | 'payment_issue'
  | 'query_response'
  | 'staff_report';

export type FormSubmission = {
  id: string;
  communityId: string;
  type: FormType;
  typeTitle: string;
  submitterName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  fields: Record<string, string>;
};

export type FormLink = {
  id: string;
  communityId: string;
  title: string;
  url: string;
};

export type DueItem = {
  id: string;
  communityId: string;
  title: string;
  amountKobo: number;
  paid: boolean;
  claimed: boolean;
  payers: string[];
};

export type TransferClaim = {
  id: string;
  communityId: string;
  dueId: string;
  dueTitle: string;
  memberName: string;
  amountKobo: number;
  createdAt: string;
};

export type MemberEntry = {
  userId: string;
  name: string;
  role: 'owner' | 'admin' | 'staff';
  tag?: string;
  email: string;
  phone: string;
};

export type MeetingRoom = {
  id: string;
  communityId: string;
  name: string;
  kind: 'room' | 'podcast' | 'management';
  live: boolean;
  participants: number;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  targetTab?: TabId;
  targetModule?: CommunityModuleId;
};

export type TabId = 'update' | 'chat' | 'feed' | 'teams' | 'events';

export type ScreenRoute =
  | { kind: 'welcome' }
  | { kind: 'tab'; tab: TabId }
  | { kind: 'chat-thread'; threadId: string }
  | { kind: 'module'; module: CommunityModuleId }
  | { kind: 'notifications' }
  | { kind: 'profile' };
