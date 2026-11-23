import { ProfileScreen } from '../../components/ProfileScreen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Screen } from '../../components/ui';

export default function Profile() {
  return (
    <>
      <ScreenHeader title="MY ACCOUNT" />
      <Screen>
        <ProfileScreen />
      </Screen>
    </>
  );
}
