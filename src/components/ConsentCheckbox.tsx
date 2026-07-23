import React from 'react';
import { Link } from 'react-router-dom';

interface ConsentCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}

export default function ConsentCheckbox({ checked, onChange, error }: ConsentCheckboxProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span className="text-sm text-stone-600">
          Li e concordo com os{' '}
          <Link to="/termos" target="_blank" className="text-emerald-600 font-semibold hover:underline">
            Termos de Uso
          </Link>{' '}
          e{' '}
          <Link to="/privacidade" target="_blank" className="text-emerald-600 font-semibold hover:underline">
            Política de Privacidade
          </Link>
          .
        </span>
      </label>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}
