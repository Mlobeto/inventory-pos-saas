import { Construction } from 'lucide-react';
import { PageHeader } from '../../shared/components/layout/PageHeader';

interface StubPageProps {
  title: string;
}

export default function StubPage({ title }: StubPageProps) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Construction className="h-16 w-16 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700">Módulo en construcción</h2>
        <p className="text-sm text-gray-400 mt-1">Esta sección estará disponible próximamente.</p>
      </div>
    </div>
  );
}
