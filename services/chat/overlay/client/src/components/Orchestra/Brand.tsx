import { useLocalize } from '~/hooks';
import { SlidersHorizontal } from 'lucide-react';

export default function Brand({ compact = false }: { compact?: boolean }) {
  const localize = useLocalize();
  return (
    <span className="orchestra-brand">
      <span className="orchestra-brand-mark" aria-hidden="true">
        <SlidersHorizontal size={22} strokeWidth={1.6} />
      </span>
      {!compact && <span>{localize('com_orchestra_brand')}</span>}
    </span>
  );
}
