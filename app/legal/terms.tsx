import { ScreenHeader } from '../../components/ScreenHeader';
import { LegalDoc } from '../../components/LegalDoc';
import { TERMS_SECTIONS } from '../../lib/legal';

export default function TermsOfUse() {
  return (
    <>
      <ScreenHeader title="TERMS OF USE" />
      <LegalDoc title="Terms of Use" sections={TERMS_SECTIONS} />
    </>
  );
}
