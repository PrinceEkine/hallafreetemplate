import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type CommunityModuleIcon = ComponentProps<typeof Ionicons>['name'];

export const COMMUNITY_MODULES = [
  {
    id: 'directory',
    label: 'DIRECTORY',
    icon: 'people',
    blurb: 'Member list and profiles',
  },
  {
    id: 'actions',
    label: 'MEETING',
    icon: 'videocam',
    blurb: 'Meeting rooms and calls',
  },
  {
    id: 'task',
    label: 'TASK',
    icon: 'list',
    blurb: 'Tasks and assignments',
  },
  {
    id: 'forms',
    label: 'FORMS',
    icon: 'document-text',
    blurb: 'Staff requests and forms',
  },
  {
    id: 'media',
    label: 'MEDIA',
    icon: 'images',
    blurb: 'Photos and videos',
  },
  {
    id: 'files',
    label: 'FILES',
    icon: 'folder',
    blurb: 'Shared files and docs',
  },
  {
    id: 'approval',
    label: 'APPROVAL',
    icon: 'checkmark-circle',
    blurb: 'Approvals inbox',
  },
  {
    id: 'polls',
    label: 'POLLS',
    icon: 'bar-chart',
    blurb: 'Polls and votes',
  },
  {
    id: 'pay',
    label: 'PAY',
    icon: 'wallet',
    blurb: 'Dues and wallet',
  },
  {
    id: 'project',
    label: 'PROJECT',
    icon: 'briefcase',
    blurb: 'Projects and tracking',
  },
  {
    id: 'contact',
    label: 'CONTACT',
    icon: 'call',
    blurb: 'Contact and support',
  },
] as const satisfies readonly {
  id: string;
  label: string;
  icon: CommunityModuleIcon;
  blurb: string;
}[];

export type CommunityModuleId = (typeof COMMUNITY_MODULES)[number]['id'];

export type ModuleSettings = Record<CommunityModuleId, boolean>;

export const DEFAULT_MODULE_SETTINGS: ModuleSettings = {
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

export function isModuleId(value: unknown): value is CommunityModuleId {
  return (
    typeof value === 'string' &&
    (COMMUNITY_MODULES as readonly { id: string }[]).some(
      (m) => m.id === value,
    )
  );
}

export function getModuleDef(id: string) {
  return COMMUNITY_MODULES.find((m) => m.id === id) ?? null;
}

export function normalizeModuleSettings(input: unknown): ModuleSettings {
  const out: ModuleSettings = { ...DEFAULT_MODULE_SETTINGS };
  if (input && typeof input === 'object') {
    for (const mod of COMMUNITY_MODULES) {
      const value = (input as Record<string, unknown>)[mod.id];
      if (typeof value === 'boolean') out[mod.id] = value;
    }
  }
  return out;
}

export function enabledModuleDefs(settings: ModuleSettings) {
  return COMMUNITY_MODULES.filter((m) => settings[m.id]);
}

/** Dedicated screen for each sidebar module. */
export const MODULE_ROUTES: Record<CommunityModuleId, string> = {
  directory: '/community/directory',
  actions: '/community/actions',
  task: '/community/task',
  forms: '/forms',
  media: '/community/media',
  files: '/community/files',
  approval: '/community/approval',
  polls: '/community/polls',
  pay: '/wallet',
  project: '/community/project',
  contact: '/community/contact',
};
