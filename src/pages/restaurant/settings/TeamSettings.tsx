import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Users, Plus, Shield, Search, Edit2, Lock, Mail, Phone, 
  CheckCircle, AlertCircle, Key, Loader2, X, Filter, 
  ToggleLeft, ToggleRight, AlertTriangle, Trash2, Settings,
  Database, Archive, Play, RefreshCw, ShieldAlert
} from 'lucide-react';
import { auth } from '../../../firebase';
import { useAuth } from '../../../contexts/AuthContext';
import { TeamFormModal } from '../../../components/team/TeamFormModal';
import { TeamMemberFormData, isOperationalConfigIncomplete } from '../../../types/team';
import { 
  LoadingState, 
  EmptyState, 
  InlineFeedback,
  PageHeader,
  Button,
  IconButton,
  Badge,
  Modal,
  SearchInput,
  Select,
  FormField,
  Input,
  DataTableContainer,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Card,
  SectionHeader,
} from '../../../components/ui';

export default function TeamSettings() {
  const { profile, user } = useAuth();
  const [searchParams] = useSearchParams();
  
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialModalStep, setInitialModalStep] = useState<number>(1);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<any | null>(null);
  const [deleteDependencies, setDeleteDependencies] = useState<string[] | null>(null);
  
  const [resetPasswordData, setResetPasswordData] = useState({
    memberId: '',
    memberName: '',
    password: ''
  });

  // Migration and LGPD States
  const [showMigrationPanel, setShowMigrationPanel] = useState(false);
  const [migrationMode, setMigrationMode] = useState<string | null>(null);
  const [migrationResult, setMigrationResult] = useState<any | null>(null);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [backupIdInput, setBackupIdInput] = useState('');
  const [isAnonymizeModalOpen, setIsAnonymizeModalOpen] = useState(false);
  const [memberToAnonymize, setMemberToAnonymize] = useState<any | null>(null);

  const runMigrationEngine = async (mode: string, backupId?: string) => {
    setError(null);
    setSuccess(null);
    setMigrationLoading(true);
    setMigrationMode(mode);
    setMigrationResult(null);

    try {
      const response = await fetch('/api/restaurant/team/migration-engine', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ mode, backupId })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao executar operação do motor de migração.');
      }

      setMigrationResult(data);
      if (mode === 'migrate') {
        setSuccess(`Migração concluída com sucesso! Backup de segurança gerado: ${data.autoBackupId || 'N/A'}`);
        fetchTeam();
      } else if (mode === 'backup') {
        setSuccess(`Backup gerado com sucesso! ID: ${data.backupId}`);
      } else if (mode === 'rollback') {
        setSuccess('Rollback executado com sucesso! Todos os dados originais foram restaurados.');
        fetchTeam();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro durante a operação de migração.');
    } finally {
      setMigrationLoading(false);
    }
  };

  const handleOpenAnonymizeModal = (member: any) => {
    if (member.id === profile?.uid) {
      setError('Você não pode anonimizar a si próprio.');
      return;
    }
    setMemberToAnonymize(member);
    setIsAnonymizeModalOpen(true);
  };

  const handleAnonymize = async () => {
    if (!memberToAnonymize) return;
    setError(null);
    setSuccess(null);
    setActionLoading(true);

    try {
      const response = await fetch(`/api/restaurant/team/${memberToAnonymize.id}/anonymize`, {
        method: 'POST',
        headers: await getHeaders()
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao anonimizar membro da equipe.');
      }

      setSuccess('Membro da equipe anonimizado em conformidade com as regras LGPD!');
      setIsAnonymizeModalOpen(false);
      fetchTeam();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao anonimizar membro da equipe.');
    } finally {
      setActionLoading(false);
    }
  };

  const opRole = (profile?.role || '').toUpperCase();
  const isOwner = opRole === 'OWNER';
  const isRestaurantAdmin = opRole === 'RESTAURANT_ADMIN';
  const isManager = opRole === 'MANAGER';
  const hasWritePermission = isOwner || isRestaurantAdmin || isManager;

  const canManageRole = (targetRole: string, currentRole?: string) => {
    if (isOwner) return true;
    if (isRestaurantAdmin) {
      if (targetRole === 'OWNER' || currentRole === 'OWNER') return false;
      return true;
    }
    if (isManager) {
      if (['OWNER', 'RESTAURANT_ADMIN'].includes(targetRole) || (currentRole && ['OWNER', 'RESTAURANT_ADMIN'].includes(currentRole))) return false;
      return true;
    }
    return false;
  };

  const getHeaders = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Usuário não autenticado.");
    const token = await currentUser.getIdToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const fetchTeam = useCallback(async (isReset = true) => {
    try {
      if (isReset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const params = new URLSearchParams();
      params.set('pageSize', '20');
      if (roleFilter !== 'ALL') params.set('role', roleFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      if (!isReset && nextCursor) {
        params.set('cursor', nextCursor);
      }

      const response = await fetch(`/api/restaurant/team?${params.toString()}`, {
        headers: await getHeaders()
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar equipe.');
      }

      const newDocs = data.team || [];
      setHasMore(!!data.hasMore);
      setNextCursor(data.nextCursor || null);

      if (isReset) {
        setTeam(newDocs);
      } else {
        setTeam(prev => {
          const map = new Map<string, any>();
          [...prev, ...newDocs].forEach(m => map.set(m.id, m));
          return Array.from(map.values());
        });
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro ao carregar a equipe.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [roleFilter, statusFilter, searchTerm, nextCursor]);

  useEffect(() => {
    fetchTeam(true);
  }, [roleFilter, statusFilter, searchTerm]);

  useEffect(() => {
    const createParam = searchParams.get('create') || searchParams.get('role');
    if (createParam) {
      const roleUpper = createParam.toUpperCase();
      const validRoles = ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER', 'DRIVER', 'CASHIER', 'KITCHEN'];
      if (validRoles.includes(roleUpper)) {
        setEditingMember(null);
        setInitialModalStep(1);
        setIsModalOpen(true);
      }
    }
  }, [searchParams]);

  const handleOpenCreateModal = () => {
    if (!hasWritePermission) return;
    setEditingMember(null);
    setInitialModalStep(1);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (member: any) => {
    if (!canManageRole(member.role)) return;
    setEditingMember(member);
    setInitialModalStep(1);
    setIsModalOpen(true);
  };

  const handleOpenCompleteConfig = (member: any) => {
    if (!canManageRole(member.role)) return;
    setEditingMember(member);
    setInitialModalStep(4); // Open directly at Step 4: Operational Config
    setIsModalOpen(true);
  };

  const handleOpenResetModal = (member: any) => {
    if (!canManageRole(member.role)) return;
    setResetPasswordData({
      memberId: member.id,
      memberName: member.nome || member.name || '',
      password: ''
    });
    setIsResetModalOpen(true);
  };

  const handleOpenDeleteModal = (member: any) => {
    if (!canManageRole(member.role)) return;
    if (member.id === profile?.uid) {
      setError('Você não pode excluir a si próprio.');
      return;
    }
    setMemberToDelete(member);
    setDeleteDependencies(null);
    setIsDeleteModalOpen(true);
  };

  const handleFormModalSubmit = async (formData: TeamMemberFormData) => {
    setError(null);
    setSuccess(null);

    const body = {
      ...formData,
      name: formData.nome,
      phone: formData.phone
    };

    if (editingMember) {
      const res = await fetch(`/api/restaurant/team/${editingMember.id}`, {
        method: 'PUT',
        headers: await getHeaders(),
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar membro da equipe.');
      setSuccess('Membro da equipe atualizado com sucesso!');
    } else {
      const res = await fetch('/api/restaurant/team', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar membro da equipe.');
      setSuccess('Membro da equipe cadastrado com sucesso!');
    }

    setIsModalOpen(false);
    fetchTeam();
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setActionLoading(true);

    try {
      const response = await fetch(`/api/restaurant/team/${resetPasswordData.memberId}/reset-password`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({
          password: resetPasswordData.password
        })
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao redefinir senha.');
      }
      
      setSuccess('Senha redefinida com sucesso!');
      setIsResetModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro ao redefinir senha.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!memberToDelete) return;
    setError(null);
    setSuccess(null);
    setActionLoading(true);

    try {
      const response = await fetch(`/api/restaurant/team/${memberToDelete.id}`, {
        method: 'DELETE',
        headers: await getHeaders()
      });
      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 409 && data.dependencies) {
          setDeleteDependencies(data.dependencies);
          throw new Error('O usuário possui vínculos e não pode ser excluído.');
        }
        throw new Error(data.error || 'Erro ao excluir usuário.');
      }
      
      setSuccess('Usuário excluído com sucesso!');
      setIsDeleteModalOpen(false);
      fetchTeam();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro ao excluir usuário.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeactivateInsteadOfDelete = async () => {
    if (!memberToDelete) return;
    setError(null);
    setSuccess(null);
    setActionLoading(true);
    
    try {
      const response = await fetch(`/api/restaurant/team/${memberToDelete.id}/status`, {
        method: 'PUT',
        headers: await getHeaders(),
        body: JSON.stringify({ status: 'INACTIVE' })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao desativar usuário.');
      
      setSuccess('Usuário desativado com sucesso!');
      setIsDeleteModalOpen(false);
      fetchTeam();
    } catch (err: any) {
       console.error(err);
       setError(err.message || 'Ocorreu um erro ao desativar usuário.');
    } finally {
       setActionLoading(false);
    }
  };

  const handleToggleStatus = async (member: any) => {
    if (!canManageRole(member.role)) return;
    setError(null);
    setSuccess(null);
    const newStatus = member.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const response = await fetch(`/api/restaurant/team/${member.id}/status`, {
        method: 'PUT',
        headers: await getHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao alterar status.');
      setSuccess(`Status alterado com sucesso!`);
      fetchTeam();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao alterar status.');
    }
  };

  // Translations and Mappings
  const roleLabels: Record<string, string> = {
    OWNER: 'Proprietário Principal',
    RESTAURANT_ADMIN: 'Administrador',
    MANAGER: 'Gerente',
    WAITER: 'Garçom',
    DRIVER: 'Entregador',
    CASHIER: 'Operador de Caixa',
    KITCHEN: 'Cozinha'
  };

  const roleBadgeVariants: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
    OWNER: 'neutral',
    RESTAURANT_ADMIN: 'info',
    MANAGER: 'info',
    WAITER: 'success',
    DRIVER: 'warning',
    CASHIER: 'warning',
    KITCHEN: 'danger'
  };

  const getMigrationModeLabel = (mode: string) => {
    switch (mode) {
      case 'dry-run': return 'Análise de Saneamento';
      case 'backup': return 'Geração de Backup';
      case 'migrate': return 'Execução de Migração';
      case 'validate': return 'Validação de Dados';
      case 'rollback': return 'Reversão de Estado';
      default: return mode?.toUpperCase() || '';
    }
  };

  // Filtering
  const filteredTeam = team.filter(member => {
    const matchesSearch = 
      member.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.phone?.includes(searchTerm);
    
    const matchesRole = roleFilter === 'ALL' || member.role === roleFilter;
    const matchesStatus = statusFilter === 'ALL' || (member.status === statusFilter || (member.status === undefined && member.active === (statusFilter === 'ACTIVE')));

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 animate-fade-in">
      {/* Header */}
      <PageHeader
        title="Equipe"
        description="Gerencie usuários, funções e permissões do restaurante."
        icon={Users}
        action={
          <div className="flex flex-wrap items-center gap-3">
            {(isOwner || isRestaurantAdmin) && (
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowMigrationPanel(!showMigrationPanel)}
                icon={<Database className="w-4 h-4" />}
              >
                Migração & Saneamento
              </Button>
            )}

            {hasWritePermission && (
              <Button
                variant="primary"
                size="md"
                onClick={handleOpenCreateModal}
                icon={<Plus className="w-4 h-4" />}
              >
                Adicionar Membro
              </Button>
            )}
          </div>
        }
      />

      {/* Migration & LGPD Panel */}
      {showMigrationPanel && (isOwner || isRestaurantAdmin) && (
        <Card className="space-y-6 animate-fade-in" padding="md">
          <SectionHeader
            title="Painel de Migração & LGPD"
            description="Gerencie a migração segura dos perfis operacionais e a anonimização de dados."
            action={
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowMigrationPanel(false)}
                className="text-stone-400 hover:text-stone-600"
                aria-label="Fechar painel"
              >
                <X className="w-5 h-5" />
              </IconButton>
            }
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
            <Button
              variant="secondary"
              onClick={() => runMigrationEngine('dry-run')}
              disabled={migrationLoading}
              className="flex flex-col items-center justify-center p-4 h-24 text-center border-stone-200"
              icon={<RefreshCw className={`w-5 h-5 text-emerald-600 ${migrationLoading && migrationMode === 'dry-run' ? 'animate-spin' : ''}`} />}
            >
              <span className="text-xs font-bold text-stone-700">1. Simulação</span>
            </Button>

            <Button
              variant="secondary"
              onClick={() => runMigrationEngine('backup')}
              disabled={migrationLoading}
              className="flex flex-col items-center justify-center p-4 h-24 text-center border-stone-200"
              icon={<Archive className={`w-5 h-5 text-emerald-600 ${migrationLoading && migrationMode === 'backup' ? 'animate-pulse' : ''}`} />}
            >
              <span className="text-xs font-bold text-stone-700">2. Backup</span>
            </Button>

            <Button
              variant="secondary"
              onClick={() => runMigrationEngine('migrate')}
              disabled={migrationLoading}
              className="flex flex-col items-center justify-center p-4 h-24 text-center border-stone-200"
              icon={<Play className={`w-5 h-5 text-emerald-600 ${migrationLoading && migrationMode === 'migrate' ? 'animate-pulse' : ''}`} />}
            >
              <span className="text-xs font-bold text-stone-700">3. Migração</span>
            </Button>

            <Button
              variant="secondary"
              onClick={() => runMigrationEngine('validate')}
              disabled={migrationLoading}
              className="flex flex-col items-center justify-center p-4 h-24 text-center border-stone-200"
              icon={<CheckCircle className={`w-5 h-5 text-emerald-600 ${migrationLoading && migrationMode === 'validate' ? 'animate-pulse' : ''}`} />}
            >
              <span className="text-xs font-bold text-stone-700">4. Validar</span>
            </Button>

            <div className="flex flex-col bg-stone-50 border border-stone-200 rounded-xl p-3 justify-between">
              <Input
                type="text"
                placeholder="ID do Backup"
                value={backupIdInput}
                onChange={(e) => setBackupIdInput(e.target.value)}
                className="w-full text-xs min-h-[36px] py-1 px-2.5 h-9 bg-white"
              />
              <Button
                onClick={() => runMigrationEngine('rollback', backupIdInput)}
                disabled={migrationLoading || !backupIdInput}
                variant="destructive"
                size="sm"
                className="w-full text-[11px] min-h-[32px] py-1 mt-1.5"
                icon={<Trash2 className="w-3.5 h-3.5" />}
              >
                5. Reverter
              </Button>
            </div>
          </div>

          {/* Migration Loading Feedback */}
          {migrationLoading && (
            <InlineFeedback
              type="info"
              message={`Processando: ${getMigrationModeLabel(migrationMode)}... Por favor, aguarde.`}
            />
          )}

          {/* Dry Run / Validate Results */}
          {migrationResult && (
            <div className="p-5 bg-stone-50 border border-stone-200 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="neutral">
                  Resultado: {getMigrationModeLabel(migrationMode)}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMigrationResult(null)}
                  className="text-stone-400 hover:text-stone-600 text-xs font-bold"
                >
                  Limpar Resultado
                </Button>
              </div>

              {/* DRY RUN REPORT */}
              {migrationResult.report && migrationMode === 'dry-run' && (
                <div className="text-xs space-y-3 font-medium text-stone-600">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white p-3 rounded-xl border border-stone-200">
                    <div>
                      <p className="text-stone-400 text-xs font-bold uppercase tracking-wider">Analisados</p>
                      <p className="text-lg font-bold text-stone-800">{migrationResult.report.analyzedCount}</p>
                    </div>
                    <div>
                      <p className="text-stone-400 text-xs font-bold uppercase tracking-wider">Prontos</p>
                      <p className="text-lg font-bold text-emerald-600">{migrationResult.report.readyToMigrateCount}</p>
                    </div>
                    <div>
                      <p className="text-stone-400 text-xs font-bold uppercase tracking-wider">Incompletos</p>
                      <p className="text-lg font-bold text-amber-600">{migrationResult.report.incompleteCount}</p>
                    </div>
                    <div>
                      <p className="text-stone-400 text-xs font-bold uppercase tracking-wider">Conflitos</p>
                      <p className="text-lg font-bold text-rose-600">{migrationResult.report.conflictsCount}</p>
                    </div>
                  </div>

                  {migrationResult.report.orphansInLegacy?.length > 0 && (
                    <div className="p-3 bg-red-50 text-red-800 border border-red-100 rounded-lg">
                      <p className="font-bold mb-1">Perfis Órfãos Legados:</p>
                      <ul className="list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto">
                        {migrationResult.report.orphansInLegacy.map((x: string, idx: number) => (
                          <li key={idx}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {migrationResult.report.criticalConflicts?.length > 0 && (
                    <div className="p-3 bg-red-50 text-red-800 border border-red-100 rounded-lg">
                      <p className="font-bold mb-1">Conflitos Críticos:</p>
                      <ul className="list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto">
                        {migrationResult.report.criticalConflicts.map((x: string, idx: number) => (
                          <li key={idx}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {migrationResult.report.incompatibleFields?.length > 0 && (
                    <div className="p-3 bg-amber-50 text-amber-800 border border-amber-100 rounded-lg">
                      <p className="font-bold mb-1">Campos / Perfis Incompletos:</p>
                      <ul className="list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto">
                        {migrationResult.report.incompatibleFields.map((x: string, idx: number) => (
                          <li key={idx}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* VALIDATION REPORT */}
              {migrationResult.report && migrationMode === 'validate' && (
                <div className="text-xs space-y-3 font-medium text-stone-600">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={migrationResult.report.validationPassed ? 'success' : 'danger'}>
                      {migrationResult.report.validationPassed ? 'Validação Aprovada' : 'Validação Reprovada'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-white p-3 rounded-xl border border-stone-200">
                    <div>
                      <p className="text-stone-400 text-xs font-bold uppercase tracking-wider">Usuários</p>
                      <p className="text-lg font-bold text-stone-800">{migrationResult.report.totalUsers}</p>
                    </div>
                    <div>
                      <p className="text-stone-400 text-xs font-bold uppercase tracking-wider">Perfis Consolidados</p>
                      <p className="text-lg font-bold text-stone-800">{migrationResult.report.totalProfiles}</p>
                    </div>
                    <div>
                      <p className="text-stone-400 text-xs font-bold uppercase tracking-wider">Taxa de Completude</p>
                      <p className="text-lg font-bold text-emerald-600">
                        {migrationResult.report.profileCompletenessRate?.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {migrationResult.report.errors?.length > 0 && (
                    <div className="p-3 bg-red-50 text-red-800 border border-red-100 rounded-lg">
                      <p className="font-bold mb-1">Inconsistências Encontradas:</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {migrationResult.report.errors.map((x: string, idx: number) => (
                          <li key={idx}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* OTHER ENGINE RESULTS */}
              {!migrationResult.report && (
                <pre className="text-[11px] bg-stone-900 text-stone-100 p-4 rounded-xl overflow-x-auto max-h-60">
                  {JSON.stringify(migrationResult, null, 2)}
                </pre>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Error / Success Messages */}
      {error && (
        <InlineFeedback type="error" message={error} />
      )}
      
      {success && (
        <InlineFeedback type="success" message={success} />
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full">
          <SearchInput
            placeholder="Buscar por nome, e-mail ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex w-full md:w-auto gap-3 items-center">
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
            <Filter className="w-4 h-4 text-stone-400" />
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="min-h-[44px]"
            >
              <option value="ALL">Todos os Perfis</option>
              <option value="OWNER">Proprietário</option>
              <option value="RESTAURANT_ADMIN">Administrador</option>
              <option value="MANAGER">Gerente</option>
              <option value="WAITER">Garçom</option>
              <option value="DRIVER">Entregador</option>
              <option value="CASHIER">Caixa</option>
              <option value="KITCHEN">Cozinha</option>
            </Select>
          </div>
          
          <div className="w-full md:w-auto">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-[44px]"
            >
              <option value="ALL">Qualquer Status</option>
              <option value="ACTIVE">Ativos</option>
              <option value="INACTIVE">Inativos</option>
            </Select>
          </div>
        </div>
      </div>

      {/* Team List */}
      <DataTableContainer>
        {loading ? (
          <LoadingState message="Carregando integrantes da equipe..." />
        ) : filteredTeam.length === 0 ? (
          <EmptyState
            title="Nenhum membro encontrado"
            description={
              searchTerm || roleFilter !== 'ALL' || statusFilter !== 'ALL' 
                ? 'Tente ajustar os filtros de busca para visualizar os membros.' 
                : 'Você ainda não adicionou ninguém à sua equipe.'
            }
            icon={Users}
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenCreateModal}
              >
                Adicionar Integrante
              </Button>
            }
            className="my-6 border-none shadow-none"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membro</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Últ. Acesso</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead align="right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeam.map((member) => {
                const isActive = member.status === 'ACTIVE' || (member.active !== false && member.status !== 'INACTIVE');
                const roleLabel = roleLabels[member.role] || member.role;
                const canEdit = canManageRole(member.role, member.role);
                const isIncomplete = isOperationalConfigIncomplete(member);
                const roleBadgeVariant = roleBadgeVariants[member.role] || 'neutral';
                
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 bg-stone-100 text-stone-700 font-bold rounded-full flex items-center justify-center shrink-0 border border-stone-200">
                          {member.nome ? member.nome.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-stone-800">{member.nome || 'Sem Nome'}</p>
                            {member.id === profile?.uid && (
                              <Badge variant="neutral" className="text-[10px]">Você</Badge>
                            )}
                          </div>
                          {member.displayName && member.displayName !== member.nome && (
                            <p className="text-xs text-stone-500">Exibição: {member.displayName}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-left">
                        <div className="flex items-center gap-2 text-stone-600">
                          <Mail className="w-3.5 h-3.5" />
                          <span>{member.email}</span>
                        </div>
                        {member.phone && (
                          <div className="flex items-center gap-2 text-stone-500 text-xs">
                            <Phone className="w-3.5 h-3.5" />
                            <span>{member.phone}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1 text-left">
                        <Badge variant={roleBadgeVariant} className="flex items-center gap-1.5 font-bold">
                          <Shield className="w-3.5 h-3.5 opacity-70" />
                          {roleLabel}
                        </Badge>
                        {isIncomplete && (
                          <Badge variant="warning" className="mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Config. Incompleta
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isActive ? 'success' : 'danger'}>
                        {isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-stone-500 text-left">
                      {member.lastAccessAt ? new Date(member.lastAccessAt).toLocaleDateString('pt-BR') : '-'}
                    </TableCell>
                    <TableCell className="text-stone-500 text-left">
                      {member.data_criacao ? new Date(member.data_criacao).toLocaleDateString('pt-BR') : '-'}
                    </TableCell>
                    <TableCell align="right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canEdit && (
                          <>
                            {isIncomplete && (
                              <Button
                                onClick={() => handleOpenCompleteConfig(member)}
                                variant="secondary"
                                size="sm"
                                className="text-xs font-extrabold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 min-h-[32px] rounded-xl border border-amber-200/80 transition-colors flex items-center gap-1.5"
                                title="Completar Configuração Operacional"
                                icon={<Settings className="w-3.5 h-3.5 text-amber-600" />}
                              >
                                Completar
                              </Button>
                            )}
                            <IconButton
                              onClick={() => handleToggleStatus(member)}
                              variant="ghost"
                              size="sm"
                              className={`text-stone-400 ${
                                isActive 
                                  ? 'hover:text-rose-600 hover:bg-rose-50' 
                                  : 'hover:text-emerald-600 hover:bg-emerald-50'
                              }`}
                              aria-label={isActive ? 'Desativar Acesso' : 'Ativar Acesso'}
                            >
                              {isActive ? <ToggleRight className="w-5 h-5 text-emerald-600" /> : <ToggleLeft className="w-5 h-5" />}
                            </IconButton>
                            <IconButton
                              onClick={() => handleOpenResetModal(member)}
                              variant="ghost"
                              size="sm"
                              className="text-stone-400 hover:text-amber-600 hover:bg-amber-50"
                              aria-label="Redefinir Senha"
                            >
                              <Key className="w-5 h-5" />
                            </IconButton>
                            {member.id !== profile?.uid && !member.isAnonymized && (
                              <IconButton
                                onClick={() => handleOpenAnonymizeModal(member)}
                                variant="ghost"
                                size="sm"
                                className="text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                                aria-label="Anonimizar (LGPD)"
                              >
                                <ShieldAlert className="w-5 h-5 text-stone-500 hover:text-rose-600" />
                              </IconButton>
                            )}
                            <IconButton
                              onClick={() => handleOpenEditModal(member)}
                              variant="ghost"
                              size="sm"
                              className="text-stone-400 hover:text-emerald-600 hover:bg-emerald-50"
                              aria-label="Editar Membro"
                            >
                              <Edit2 className="w-5 h-5" />
                            </IconButton>
                            {member.id !== profile?.uid && (
                              <IconButton
                                onClick={() => handleOpenDeleteModal(member)}
                                variant="ghost"
                                size="sm"
                                className="text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                                aria-label="Excluir"
                              >
                                <Trash2 className="w-5 h-5" />
                              </IconButton>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {hasMore && !loading && (
          <div className="p-4 border-t border-stone-200 flex justify-center bg-stone-50/50">
            <Button
              onClick={() => fetchTeam(false)}
              loading={loadingMore}
              variant="primary"
              size="md"
            >
              Carregar mais membros
            </Button>
          </div>
        )}
      </DataTableContainer>

      {/* Adaptive Multi-Step Form Modal */}
      <TeamFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleFormModalSubmit}
        editingMember={editingMember}
        operatorRole={opRole}
        initialStep={initialModalStep}
      />

      {/* Reset Password Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Redefinir Senha"
        subtitle={`Para ${resetPasswordData.memberName}`}
        icon={Key}
        iconBgColor="bg-amber-50"
        iconTextColor="text-amber-600"
      >
        <form onSubmit={handleResetPassword} className="space-y-4 text-left">
          <p className="text-stone-600 text-sm leading-relaxed">
            Você está redefinindo a senha de acesso para <strong className="text-stone-800">{resetPasswordData.memberName}</strong>.
          </p>

          <FormField label="Nova Senha" required>
            <Input
              type="password"
              required
              minLength={6}
              value={resetPasswordData.password}
              onChange={e => setResetPasswordData({ ...resetPasswordData, password: e.target.value })}
              placeholder="Mínimo de 6 caracteres"
            />
          </FormField>

          <div className="pt-4 flex justify-end gap-3 border-t border-stone-100">
            <Button
              variant="ghost"
              onClick={() => setIsResetModalOpen(false)}
              disabled={actionLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={actionLoading}
            >
              Confirmar Nova Senha
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Excluir Usuário"
        subtitle={memberToDelete ? memberToDelete.nome : ''}
        icon={Trash2}
        iconBgColor="bg-rose-50"
        iconTextColor="text-rose-600"
      >
        {deleteDependencies ? (
          <div className="space-y-4 text-left">
            <InlineFeedback
              type="warning"
              message={`Não é possível excluir fisicamente: O usuário ${memberToDelete?.nome} possui históricos operacionais (${deleteDependencies.join(', ')}). Para preservar a integridade do sistema, você só pode desativá-lo.`}
            />
            
            <div className="pt-4 flex justify-end gap-3 border-t border-stone-100">
              <Button
                variant="ghost"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={actionLoading}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleDeactivateInsteadOfDelete}
                loading={actionLoading}
              >
                Desativar Acesso
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-left">
            <p className="text-stone-600 text-sm leading-relaxed">
              Tem certeza que deseja excluir o usuário <strong className="text-stone-800">{memberToDelete?.nome}</strong> permanentemente?
            </p>
            <InlineFeedback
              type="error"
              message="Esta ação não pode ser desfeita e removerá permanentemente os acessos."
            />
            
            <div className="pt-4 flex justify-end gap-3 border-t border-stone-100">
              <Button
                variant="ghost"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={actionLoading}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                loading={actionLoading}
              >
                Sim, excluir usuário
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* LGPD Anonymize Confirmation Modal */}
      <Modal
        isOpen={isAnonymizeModalOpen}
        onClose={() => setIsAnonymizeModalOpen(false)}
        title="Anonimização LGPD"
        subtitle={memberToAnonymize ? (memberToAnonymize.nome || memberToAnonymize.name) : ''}
        icon={ShieldAlert}
        iconBgColor="bg-rose-50"
        iconTextColor="text-rose-600"
      >
        <div className="space-y-4 text-left">
          <p className="text-stone-600 text-sm leading-relaxed">
            Você tem certeza que deseja anonimizar permanentemente o usuário <strong className="text-stone-800">{memberToAnonymize?.nome || memberToAnonymize?.name}</strong> para conformidade com a LGPD?
          </p>
          
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-2 text-stone-700">
            <p className="font-bold text-xs uppercase tracking-wider text-stone-500">O que acontece ao confirmar:</p>
            <ul className="list-disc pl-4 text-xs space-y-1">
              <li>O e-mail e telefone de login serão permanentemente excluídos ou ofuscados.</li>
              <li>O nome e dados pessoais serão anonimizados para "Usuário Anonimizado".</li>
              <li>A conta de login correspondente no Firebase Authentication será desativada.</li>
              <li>O funcionário não conseguirá mais realizar login no sistema.</li>
            </ul>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-stone-100">
            <Button
              variant="ghost"
              onClick={() => setIsAnonymizeModalOpen(false)}
              disabled={actionLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleAnonymize}
              loading={actionLoading}
            >
              Confirmar Anonimização
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
