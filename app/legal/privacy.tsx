import { ScreenHeader } from '../../components/ScreenHeader';
import { LegalDoc } from '../../components/LegalDoc';
import { PRIVACY_SECTIONS } from '../../lib/legal';

export default function PrivacyPolicy() {
  return (
    <>
      <ScreenHeader title="PRIVACY POLICY" />
      <LegalDoc title="Privacy Policy" sections={PRIVACY_SECTIONS} />
    </>
  );
}
