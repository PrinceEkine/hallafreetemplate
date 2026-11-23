import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

export const FORM_TYPES = [
  { id: 'data_correction', title: 'Data Correction' },
  { id: 'leave_request', title: 'Leave Request' },
  { id: 'payment_issue', title: 'Payment Issue' },
  { id: 'query_response', title: 'Query Response' },
  { id: 'staff_report', title: 'Report Staff' },
] as const;

export type FormType = (typeof FORM_TYPES)[number]['id'];

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
        'Misconduct',
        'Theft / fraud',
        'Other',
      ],
      required: true,
    },
    { key: 'incident_date', label: 'INCIDENT DATE', kind: 'date', required: true },
    { key: 'place', label: 'WHERE IT HAPPENED', kind: 'text' },
    { key: 'details', label: 'WHAT HAPPENED', kind: 'textarea', required: true },
    { key: 'witnesses', label: 'WITNESSES', kind: 'text' },
  ],
};

export function fieldLabel(type: FormType, key: string): string {
  return FORM_DEFS[type]?.find((f) => f.key === key)?.label ?? key;
}

export type Submission = {
  id: string;
  community_id: string;
  communityName: string;
  type: FormType;
  typeTitle: string;
  values: Record<string, string>;
  evidence: string[];
  status: 'pending' | 'approved' | 'rejected';
  submitterName: string;
  reviewNote: string;
  created_at: string;
};

type SubmissionRow = {
  id: string;
  community_id: string;
  type: string;
  payload: { values?: Record<string, string>; evidence?: string[] } | null;
  status: string;
  review_note: string;
  created_at: string;
  community: { name: string } | null;
  submitter: { full_name: string | null } | null;
};

const SELECT =
  'id,community_id,type,payload,status,review_note,created_at,community:communities!form_submissions_community_id_fkey(name),submitter:profiles!form_submissions_submitted_by_fkey(full_name)';

function mapRow(row: SubmissionRow): Submission {
  const title = FORM_TYPES.find((t) => t.id === row.type)?.title ?? row.type;
  return {
    id: String(row.id),
    community_id: String(row.community_id),
    communityName: row.community?.name ?? 'Community',
    type: row.type as FormType,
    typeTitle: title,
    values: row.payload?.values ?? {},
    evidence: row.payload?.evidence ?? [],
    status: (row.status as Submission['status']) ?? 'pending',
    submitterName: row.submitter?.full_name ?? 'Staff Member',
    reviewNote: String(row.review_note ?? ''),
    created_at: String(row.created_at),
  };
}

export async function myAdminCommunityIds(): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('community_members')
    .select('community_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('role', ['owner', 'admin']);
  return ((data as unknown as { community_id: string }[]) ?? []).map(
    (r) => r.community_id,
  );
}

export async function listMySubmissions(): Promise<Submission[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('form_submissions')
    .select(SELECT)
    .eq('submitted_by', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (!data) return [];
  return (data as unknown as SubmissionRow[]).map(mapRow);
}

export async function listPendingApprovals(): Promise<Submission[]> {
  const ids = await myAdminCommunityIds();
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from('form_submissions')
    .select(SELECT)
    .in('community_id', ids)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);
  if (!data) return [];
  return (data as unknown as SubmissionRow[]).map(mapRow);
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const { data } = await supabase
    .from('form_submissions')
    .select(SELECT)
    .eq('id', id)
    .single();
  if (!data) return null;
  return mapRow(data as unknown as SubmissionRow);
}

export async function reviewSubmission(
  id: string,
  status: 'approved' | 'rejected',
  note: string,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { error } = await supabase
    .from('form_submissions')
    .update({ status, review_note: note.trim(), reviewed_by: user.id })
    .eq('id', id);
  if (error) throw error;
}

export async function submitForm(
  communityId: string,
  type: FormType,
  values: Record<string, string>,
  evidence: string[],
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const { data, error } = await supabase
    .from('form_submissions')
    .insert({
      community_id: communityId,
      submitted_by: user.id,
      type,
      payload: { values, evidence },
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Could not submit.');
  return String((data as { id: string }).id);
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function uploadEvidence(
  communityId: string,
  files: { uri: string; name: string }[],
): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const paths: string[] = [];
  for (const file of files) {
    const source = new File(file.uri);
    if (!source.exists) throw new Error(`Could not read ${file.name}.`);
    const bytes = await source.bytes();
    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw new Error(`${file.name} is larger than 10MB.`);
    }
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${communityId}/${user.id}/${Crypto.randomUUID()}_${safe}`;
    const { error } = await supabase.storage
      .from('evidence')
      .upload(path, bytes);
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

export async function openEvidence(path: string): Promise<void> {
  const { data, error } = await supabase.storage
    .from('evidence')
    .createSignedUrl(path, 600);
  if (error || !data) throw error ?? new Error('Could not open file.');
  await Linking.openURL(data.signedUrl);
}

export async function listCommunityPendingApprovals(
  communityId: string,
): Promise<Submission[]> {
  const { data } = await supabase
    .from('form_submissions')
    .select(SELECT)
    .eq('community_id', communityId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);
  if (!data) return [];
  return (data as unknown as SubmissionRow[]).map(mapRow);
}

export async function listCommunityMySubmissions(
  communityId: string,
): Promise<Submission[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('form_submissions')
    .select(SELECT)
    .eq('community_id', communityId)
    .eq('submitted_by', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (!data) return [];
  return (data as unknown as SubmissionRow[]).map(mapRow);
}
