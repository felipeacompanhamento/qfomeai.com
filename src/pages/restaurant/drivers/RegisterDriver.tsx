import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function RegisterDriver() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/restaurant/settings/team?create=DRIVER', { replace: true });
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center space-y-4">
      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      <p className="text-stone-600 text-sm font-medium">
        Redirecionando para a Central de Equipe para cadastrar entregador...
      </p>
    </div>
  );
}
