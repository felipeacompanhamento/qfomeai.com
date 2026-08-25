import React from 'react';
import { LucideIcon, FileText } from 'lucide-react';
import { EmptyState } from '../../../../components/ui/Feedback';
import { Button } from '../../../../components/ui/Button';

interface EmptyFinancialStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actionButton?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyFinancialState: React.FC<EmptyFinancialStateProps> = ({
  title = 'Nenhum registro encontrado',
  description = 'Não há lançamentos cadastrados até o momento com os filtros selecionados.',
  icon: Icon = FileText,
  actionButton
}) => {
  return (
    <EmptyState
      title={title}
      description={description}
      icon={Icon}
      action={
        actionButton ? (
          <Button
            onClick={actionButton.onClick}
            size="sm"
          >
            {actionButton.label}
          </Button>
        ) : undefined
      }
      className="bg-white max-w-md my-6 shadow-xs"
    />
  );
};
