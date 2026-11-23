import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  Button,
  ErrorText,
  Field,
  Heading,
  Screen,
  Subtext,
} from '../../components/ui';
import {
  createProject,
  isCommunityAdmin,
} from '../../lib/communityContent';
import { resolveSelectedCommunityId } from '../../lib/selectedCommunity';

export default function NewProject() {
  const { id: paramId } = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState<string | null>(paramId ?? null);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const scoped = paramId ?? (await resolveSelectedCommunityId().catch(() => null));
      setId(scoped);
      setAdmin(scoped ? await isCommunityAdmin(scoped) : false);
    })();
  }, [paramId]);

  async function handleCreate() {
    setError(null);
    if (!id) return;
    if (name.trim().length < 3) {
      setError('Give the project a name.');
      return;
    }
    setLoading(true);
    try {
      await createProject(id, { name, description });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create project.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ScreenHeader title="NEW PROJECT" communityId={id ?? null} showMenu />
      <Screen>
        <Heading>New project</Heading>
        {admin === null ? (
          <Subtext>Checking permissions…</Subtext>
        ) : !id ? (
          <Subtext>
            Join or create a community first, then come back to create a
            project.
          </Subtext>
        ) : !admin ? (
          <Subtext>Only community admins can create projects.</Subtext>
        ) : (
          <>
            <Field
              label="PROJECT NAME"
              placeholder="Office relocation"
              value={name}
              onChangeText={setName}
            />
            <Field
              label="DESCRIPTION (OPTIONAL)"
              placeholder="What is this project about?"
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
            />
            <ErrorText message={error} />
            <Button
              title="Create project"
              loading={loading}
              onPress={handleCreate}
            />
          </>
        )}
      </Screen>
    </>
  );
}
