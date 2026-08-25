import React, { useState, useEffect } from 'react';
import { 
  X, Check, AlertCircle, ArrowLeft, ArrowRight, Shield, User, Key, Lock, 
  Settings, Save, AlertTriangle, Truck, UtensilsCrossed, ShoppingBag, 
  DollarSign, Package, Users, Info, CheckCircle, RefreshCw
} from 'lucide-react';
import { TeamRole, UserStatusType, TeamMemberFormData, getDefaultOperationalConfigs } from '../../types/team';
import { 
  CANONICAL_PERMISSIONS_CATALOG, 
  CANONICAL_PERMISSIONS_MAP,
  getDefaultPermissionsForRole, 
  getAllowedPermissionsForRole,
  validatePermissionsForRole,
  CanonicalPermission,
  ROLE_DEFAULT_PERMISSIONS
} from './permissionsCatalog';
import { maskPhone, maskCPF, maskPlate, formatCurrency } from '../../utils/masks';
import {
  FormField,
  TextInput,
  SelectInput,
  TextareaInput,
  Switch,
  Checkbox,
  FieldGroup,
  FormSection,
} from '../ui/FormComponents';
import { Button, IconButton } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface TeamFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TeamMemberFormData) => Promise<void>;
  editingMember?: any | null;
  operatorRole: string;
  initialStep?: number;
}

const ALL_WORK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export const TeamFormModal: React.FC<TeamFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingMember,
  operatorRole,
  initialStep = 1
}) => {
  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [actionLoading, setActionLoading] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [draftSavedMessage, setDraftSavedMessage] = useState<string | null>(null);

  const defaults = getDefaultOperationalConfigs();

  const [formData, setFormData] = useState<TeamMemberFormData>({
    nome: '',
    displayName: '',
    email: '',
    phone: '',
    photoUrl: '',
    jobTitle: '',
    employeeId: '',
    admissionDate: '',
    shift: 'Manhã / Tarde',
    workDays: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
    emergencyContact: '',
    observations: '',

    role: 'WAITER',
    status: 'ACTIVE',
    password: '',
    mustChangePassword: true,

    permissions: ROLE_DEFAULT_PERMISSIONS['WAITER'],

    ownerConfig: defaults.ownerConfig,
    adminConfig: defaults.adminConfig,
    managerConfig: defaults.managerConfig,
    waiterConfig: defaults.waiterConfig,
    driverConfig: defaults.driverConfig,
    cashierConfig: defaults.cashierConfig,
    kitchenConfig: defaults.kitchenConfig
  });

  // Populate form data on edit or open
  useEffect(() => {
    if (!isOpen) return;

    setCurrentStep(initialStep || 1);
    setStepError(null);
    setDraftSavedMessage(null);

    if (editingMember) {
      const op = editingMember.operationalConfig || editingMember.config || {};
      const rawRole = (editingMember.role || 'WAITER').toUpperCase() as TeamRole;

      setFormData({
        nome: editingMember.nome || editingMember.name || '',
        displayName: editingMember.displayName || editingMember.nome || editingMember.name || '',
        email: editingMember.email || '',
        phone: editingMember.phone || editingMember.telefone || '',
        photoUrl: editingMember.photoUrl || '',
        jobTitle: editingMember.jobTitle || '',
        employeeId: editingMember.employeeId || '',
        admissionDate: editingMember.admissionDate || '',
        shift: editingMember.shift || 'Manhã / Tarde',
        workDays: editingMember.workDays || ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
        emergencyContact: editingMember.emergencyContact || '',
        observations: editingMember.observations || '',

        role: rawRole,
        status: (editingMember.status || (editingMember.active !== false ? 'ACTIVE' : 'INACTIVE')) as UserStatusType,
        password: '',
        mustChangePassword: editingMember.mustChangePassword ?? false,

        permissions: editingMember.permissions || ROLE_DEFAULT_PERMISSIONS[rawRole] || [],

        ownerConfig: { ...defaults.ownerConfig, ...(op.ownerConfig || {}) },
        adminConfig: { ...defaults.adminConfig, ...(op.adminConfig || {}) },
        managerConfig: { ...defaults.managerConfig, ...(op.managerConfig || {}) },
        waiterConfig: { 
          ...defaults.waiterConfig, 
          ...(op.waiterConfig || {}), 
          pinCode: editingMember.pinCode || op.waiterConfig?.pinCode || op.waiterConfig?.operationalPin || editingMember.operationalPin || '' 
        },
        driverConfig: { 
          ...defaults.driverConfig, 
          ...(op.driverConfig || {}), 
          vehiclePlate: editingMember.vehiclePlate || op.driverConfig?.vehiclePlate || '',
          cpf: editingMember.cpf || op.driverConfig?.cpf || '' 
        },
        cashierConfig: { 
          ...defaults.cashierConfig, 
          ...(op.cashierConfig || {}), 
          pinCode: editingMember.pinCode || op.cashierConfig?.pinCode || op.cashierConfig?.criticalActionPinRequired || editingMember.criticalActionPinRequired || '' 
        },
        kitchenConfig: { ...defaults.kitchenConfig, ...(op.kitchenConfig || {}) }
      });
    } else {
      // Check for session draft
      const draft = sessionStorage.getItem('team_member_draft');
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          setFormData(parsed);
          setDraftSavedMessage('Rascunho recuperado da sessão anterior.');
        } catch (e) {
          // ignore error
        }
      } else {
        setFormData({
          nome: '',
          displayName: '',
          email: '',
          phone: '',
          photoUrl: '',
          jobTitle: '',
          employeeId: '',
          admissionDate: new Date().toISOString().split('T')[0],
          shift: 'Manhã / Tarde',
          workDays: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
          emergencyContact: '',
          observations: '',

          role: 'WAITER',
          status: 'ACTIVE',
          password: '',
          mustChangePassword: true,

          permissions: ROLE_DEFAULT_PERMISSIONS['WAITER'],

          ownerConfig: defaults.ownerConfig,
          adminConfig: defaults.adminConfig,
          managerConfig: defaults.managerConfig,
          waiterConfig: defaults.waiterConfig,
          driverConfig: defaults.driverConfig,
          cashierConfig: defaults.cashierConfig,
          kitchenConfig: defaults.kitchenConfig
        });
      }
    }
  }, [isOpen, editingMember, initialStep]);

  if (!isOpen) return null;

  const opRoleUpper = operatorRole.toUpperCase();
  const isOwnerOperator = opRoleUpper === 'OWNER';
  const isAdminOperator = opRoleUpper === 'RESTAURANT_ADMIN';
  const isManagerOperator = opRoleUpper === 'MANAGER';

  // Role permissions constraint
  const canSelectRole = (roleOption: TeamRole) => {
    if (isOwnerOperator) return true;
    if (isAdminOperator) {
      return roleOption !== 'OWNER';
    }
    if (isManagerOperator) {
      return !['OWNER', 'RESTAURANT_ADMIN'].includes(roleOption);
    }
    return false;
  };

  const handleRoleChange = (newRole: TeamRole) => {
    if (newRole === formData.role) return;

    const validated = validatePermissionsForRole(newRole, formData.permissions);
    const defaultPerms = getDefaultPermissionsForRole(newRole);
    const combined = Array.from(new Set([...defaultPerms, ...validated.validPermissions]));

    setFormData(prev => ({
      ...prev,
      role: newRole,
      permissions: combined
    }));
  };

  const handleWorkDayToggle = (day: string) => {
    setFormData(prev => {
      const exists = prev.workDays.includes(day);
      return {
        ...prev,
        workDays: exists ? prev.workDays.filter(d => d !== day) : [...prev.workDays, day]
      };
    });
  };

  const handlePermissionToggle = (permKey: string) => {
    if (formData.role === 'OWNER') return; // OWNER cannot lose permissions

    setFormData(prev => {
      const exists = prev.permissions.includes(permKey);
      let nextPerms: string[] = [];

      if (!exists) {
        // Adding permission - automatically include prerequisites
        const permObj = CANONICAL_PERMISSIONS_MAP.get(permKey);
        const toAdd = [permKey];
        if (permObj && permObj.dependeDe) {
          permObj.dependeDe.forEach(dep => toAdd.push(dep));
        }
        const validated = validatePermissionsForRole(prev.role, [...prev.permissions, ...toAdd]);
        nextPerms = validated.validPermissions;
      } else {
        // Removing permission - remove permKey and any dependent active permissions
        const permsToRemove = new Set<string>([permKey]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const pKey of prev.permissions) {
            if (!permsToRemove.has(pKey)) {
              const pObj = CANONICAL_PERMISSIONS_MAP.get(pKey);
              if (pObj && pObj.dependeDe && pObj.dependeDe.some(dep => permsToRemove.has(dep))) {
                permsToRemove.add(pKey);
                changed = true;
              }
            }
          }
        }
        nextPerms = prev.permissions.filter(p => !permsToRemove.has(p));
      }

      return { ...prev, permissions: nextPerms };
    });
  };

  const handleModuleToggle = (modulePermissions: CanonicalPermission[]) => {
    if (formData.role === 'OWNER') return;

    const compatibleKeys = modulePermissions
      .filter(p => p.perfisCompativeis.includes(formData.role))
      .map(p => p.chave);

    if (compatibleKeys.length === 0) return;

    setFormData(prev => {
      const allSelected = compatibleKeys.every(k => prev.permissions.includes(k));
      let nextPerms: string[];

      if (!allSelected) {
        const validated = validatePermissionsForRole(prev.role, [...prev.permissions, ...compatibleKeys]);
        nextPerms = validated.validPermissions;
      } else {
        const toRemove = new Set(compatibleKeys);
        nextPerms = prev.permissions.filter(p => !toRemove.has(p));
      }

      return { ...prev, permissions: nextPerms };
    });
  };

  const handleRestoreDefaultPermissions = () => {
    setFormData(prev => ({
      ...prev,
      permissions: getDefaultPermissionsForRole(prev.role)
    }));
  };

  // Step Validation before advancing
  const validateCurrentStep = (): boolean => {
    setStepError(null);

    if (currentStep === 1) {
      if (!formData.nome.trim()) {
        setStepError('O Nome Completo é obrigatório.');
        return false;
      }
      if (!formData.displayName.trim()) {
        setStepError('O Nome de Exibição é obrigatório.');
        return false;
      }
      if (!formData.email.trim() || !formData.email.includes('@')) {
        setStepError('Informe um e-mail válido.');
        return false;
      }
      if (!formData.phone.trim() || formData.phone.length < 10) {
        setStepError('Informe um telefone válido com DDD.');
        return false;
      }
    }

    if (currentStep === 2) {
      if (!formData.role) {
        setStepError('Selecione o perfil do colaborador.');
        return false;
      }
      if (!editingMember) {
        if (!formData.password || formData.password.length < 6) {
          setStepError('A senha provisória deve ter no mínimo 6 caracteres.');
          return false;
        }
      }
    }

    if (currentStep === 4) {
      // Role-specific operational validations
      if (formData.role === 'WAITER') {
        if (!formData.waiterConfig.pinCode || formData.waiterConfig.pinCode.length < 4) {
          setStepError('O PIN do garçom é obrigatório e deve conter pelo menos 4 dígitos.');
          return false;
        }
      }
      if (formData.role === 'CASHIER') {
        if (!formData.cashierConfig.pinCode || formData.cashierConfig.pinCode.length < 4) {
          setStepError('O PIN do operador de caixa é obrigatório e deve conter pelo menos 4 dígitos.');
          return false;
        }
      }
      if (formData.role === 'DRIVER') {
        if (formData.driverConfig.vehicleType === 'moto' || formData.driverConfig.vehicleType === 'carro') {
          if (!formData.driverConfig.vehiclePlate.trim()) {
            setStepError('A placa do veículo é obrigatória para entrega motorizada.');
            return false;
          }
        }
        if (!formData.driverConfig.cpf || formData.driverConfig.cpf.replace(/\D/g, '').length < 11) {
          setStepError('O CPF do entregador é obrigatório (11 dígitos).');
          return false;
        }
      }
      if (formData.role === 'KITCHEN') {
        if (!formData.kitchenConfig.productionStations || formData.kitchenConfig.productionStations.length === 0) {
          setStepError('Selecione ao menos uma estação/praça de produção para a cozinha.');
          return false;
        }
      }
      if (formData.role === 'MANAGER') {
        if (formData.managerConfig.allowDiscounts && (!formData.managerConfig.maxDiscountPercentage || formData.managerConfig.maxDiscountPercentage <= 0)) {
          setStepError('Informe o limite percentual de desconto para o gerente.');
          return false;
        }
      }
    }

    return true;
  };

  const handleNextStep = () => {
    if (validateCurrentStep()) {
      setCurrentStep(prev => Math.min(prev + 1, 5));
    }
  };

  const handlePrevStep = () => {
    setStepError(null);
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSaveDraft = () => {
    sessionStorage.setItem('team_member_draft', JSON.stringify(formData));
    setDraftSavedMessage('Rascunho salvo temporariamente no navegador!');
    setTimeout(() => setDraftSavedMessage(null), 4000);
  };

  const handleFinalSubmit = async () => {
    if (!validateCurrentStep()) return;

    try {
      setActionLoading(true);
      setStepError(null);
      await onSubmit(formData);
      sessionStorage.removeItem('team_member_draft');
    } catch (err: any) {
      console.error(err);
      setStepError(err.message || 'Erro ao salvar informações do membro da equipe.');
    } finally {
      setActionLoading(false);
    }
  };

  const stepTitles = [
    '1. Dados Pessoais',
    '2. Acesso e Perfil',
    '3. Permissões',
    '4. Configuração Operacional',
    '5. Revisão e Confirmação'
  ];

  const rolesList: { id: TeamRole; title: string; desc: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' }[] = [
    { id: 'OWNER', title: 'Proprietário (Owner)', desc: 'Acesso total, gestão estratégica e financeira irrestrita', variant: 'neutral' },
    { id: 'RESTAURANT_ADMIN', title: 'Administrador', desc: 'Gestão operacional, financeira, estoque, produtos e equipe', variant: 'info' },
    { id: 'MANAGER', title: 'Gerente', desc: 'Supervisão do turno, autorização de descontos e cancelamentos', variant: 'info' },
    { id: 'WAITER', title: 'Garçom / Atendente', desc: 'Abertura de comanda, lançamento de pedidos, mesas e fechamento', variant: 'success' },
    { id: 'DRIVER', title: 'Entregador (Driver)', desc: 'Acesso ao painel de entregas, rotas e atualização de status', variant: 'warning' },
    { id: 'CASHIER', title: 'Operador de Caixa', desc: 'Abertura/fechamento de caixa, recebimentos, sangrias e suprimentos', variant: 'warning' },
    { id: 'KITCHEN', title: 'Cozinha / KDS', desc: 'Visualização e gestão da fila de preparo de pratos', variant: 'danger' }
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-4xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-stone-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-5 bg-stone-50/50 border-b border-stone-200/80 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
              {editingMember ? 'Edição Adaptativa de Colaborador' : 'Novo Cadastro de Colaborador'}
            </span>
            <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              {formData.nome || 'Cadastro de Equipe'}
            </h2>
          </div>
          <IconButton 
            onClick={onClose}
            variant="ghost"
            size="sm"
            className="text-stone-400 hover:text-stone-600"
            aria-label="Fechar modal"
          >
            <X className="w-6 h-6" />
          </IconButton>
        </div>

        {/* Stepper Header */}
        <div className="bg-stone-50 border-b border-stone-200 px-6 py-3 overflow-x-auto">
          <div className="flex items-center justify-between min-w-[600px] gap-2">
            {stepTitles.map((title, idx) => {
              const stepNum = idx + 1;
              const isActive = currentStep === stepNum;
              const isDone = currentStep > stepNum;
              return (
                <button
                  key={stepNum}
                  onClick={() => {
                    if (isDone || validateCurrentStep()) setCurrentStep(stepNum);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive 
                      ? 'bg-emerald-600 text-white font-bold shadow-sm' 
                      : isDone 
                      ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' 
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    isActive ? 'bg-emerald-800 text-white' : isDone ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-600'
                  }`}>
                    {isDone ? <Check className="w-3 h-3" /> : stepNum}
                  </span>
                  <span>{title.split('. ')[1]}</span>
                </button>
              );
            })}
          </div>
          {/* Progress Line */}
          <div className="w-full bg-stone-200 h-1.5 rounded-full mt-2 overflow-hidden">
            <div 
              className="bg-emerald-600 h-full transition-all duration-300"
              style={{ width: `${(currentStep / 5) * 100}%` }}
            />
          </div>
        </div>

        {/* Global Notifications */}
        {stepError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl flex items-start gap-2 animate-shake">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <span>{stepError}</span>
          </div>
        )}

        {draftSavedMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-2xl flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{draftSavedMessage}</span>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* STEP 1: DADOS PESSOAIS */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fade-in">
              <FormSection
                title="Etapa 1: Dados Pessoais do Colaborador"
                description="Informações gerais e dados de contato interno."
              >
                <FieldGroup cols={2}>
                  <FormField label="Nome Completo" required>
                    <TextInput
                      type="text"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      placeholder="Ex: Carlos Eduardo Silva"
                    />
                  </FormField>

                  <FormField label="Nome de Exibição (Crachá/Apelido)" required>
                    <TextInput
                      type="text"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                      placeholder="Ex: Cadu"
                    />
                  </FormField>

                  <FormField
                    label="E-mail Corporativo"
                    required
                    description={editingMember ? 'O e-mail principal não pode ser alterado após a criação.' : undefined}
                  >
                    <TextInput
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="carlos@restaurante.com"
                      disabled={!!editingMember}
                    />
                  </FormField>

                  <FormField label="Telefone / WhatsApp" required>
                    <TextInput
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: maskPhone(e.target.value) })}
                      placeholder="(11) 99999-9999"
                    />
                  </FormField>

                  <FormField label="URL da Foto de Perfil">
                    <TextInput
                      type="url"
                      value={formData.photoUrl}
                      onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
                      placeholder="https://..."
                    />
                  </FormField>

                  <FormField label="Cargo Interno">
                    <TextInput
                      type="text"
                      value={formData.jobTitle}
                      onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      placeholder="Ex: Garçom Chefe de Salão"
                    />
                  </FormField>

                  <FormField label="Matrícula / ID Interno">
                    <TextInput
                      type="text"
                      value={formData.employeeId}
                      onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                      placeholder="Ex: FUNC-0042"
                    />
                  </FormField>

                  <FormField label="Data de Admissão">
                    <TextInput
                      type="date"
                      value={formData.admissionDate}
                      onChange={(e) => setFormData({ ...formData, admissionDate: e.target.value })}
                    />
                  </FormField>

                  <FormField label="Turno Padrão">
                    <SelectInput
                      value={formData.shift}
                      onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                    >
                      <option value="Manhã">Manhã</option>
                      <option value="Tarde">Tarde</option>
                      <option value="Noite">Noite</option>
                      <option value="Manhã / Tarde">Manhã / Tarde</option>
                      <option value="Tarde / Noite">Tarde / Noite</option>
                      <option value="Integral">Integral / Escala 12x36</option>
                    </SelectInput>
                  </FormField>

                  <FormField label="Contato de Emergência (Nome e Fone)">
                    <TextInput
                      type="text"
                      value={formData.emergencyContact}
                      onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                      placeholder="Ex: Maria (Esposa) - (11) 98888-7777"
                    />
                  </FormField>
                </FieldGroup>

                {/* Work Days Checkboxes */}
                <div className="pt-2">
                  <FormSection title="Dias de Trabalho na Escala">
                    <div className="flex flex-wrap gap-2">
                      {ALL_WORK_DAYS.map((day) => {
                        const isChecked = formData.workDays.includes(day);
                        return (
                          <button
                            type="button"
                            key={day}
                            onClick={() => handleWorkDayToggle(day)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                              isChecked
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </FormSection>
                </div>

                <FormField label="Observações Gerais">
                  <TextareaInput
                    rows={2}
                    value={formData.observations}
                    onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                    placeholder="Anotações internas sobre contrato, restrições ou qualificações..."
                  />
                </FormField>
              </FormSection>
            </div>
          )}

          {/* STEP 2: ACESSO E PERFIL */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fade-in">
              <FormSection
                title="Etapa 2: Acesso, Perfil e Credenciais"
                description="Defina a função, privilégios e dados de login."
              >
                {/* Role Cards Selection */}
                <div>
                  <FormField label="Perfil de Acesso" required>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {rolesList.map((r) => {
                        const isSelected = formData.role === r.id;
                        const allowed = canSelectRole(r.id);
                        return (
                          <button
                            type="button"
                            key={r.id}
                            disabled={!allowed}
                            onClick={() => handleRoleChange(r.id)}
                            className={`p-3.5 rounded-2xl border text-left transition-all relative cursor-pointer ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                                : allowed
                                ? 'border-stone-200 hover:border-stone-300 bg-white'
                                : 'border-stone-100 bg-stone-50 opacity-50 cursor-not-allowed'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <Badge variant={r.variant} size="sm">
                                {r.title}
                              </Badge>
                              {isSelected && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                            </div>
                            <p className="text-xs text-stone-600 line-clamp-2 mt-1">{r.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </FormField>
                </div>

                <FieldGroup cols={2}>
                  <FormField label="Status da Conta">
                    <SelectInput
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as UserStatusType })}
                    >
                      <option value="ACTIVE">Ativo (Acesso Liberado)</option>
                      <option value="INACTIVE">Inativo (Acesso Suspenso)</option>
                      <option value="BLOCKED">Bloqueado</option>
                    </SelectInput>
                  </FormField>

                  {!editingMember && (
                    <FormField label="Senha Provisória" required>
                      <TextInput
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="Mínimo 6 caracteres"
                      />
                    </FormField>
                  )}
                </FieldGroup>

                {/* Password Requirement Switch */}
                <div className="pt-2">
                  <Switch
                    label="Exigir Troca de Senha no Primeiro Acesso"
                    description="O colaborador será forçado a definir uma nova senha no primeiro login."
                    checked={formData.mustChangePassword}
                    onChange={(checked) => setFormData({ ...formData, mustChangePassword: checked })}
                  />
                </div>
              </FormSection>
            </div>
          )}

          {/* STEP 3: PERMISSÕES CANÔNICAS */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                    <Lock className="w-5 h-5 text-emerald-600" />
                    Etapa 3: Catálogo Canônico de Permissões
                  </h3>
                  <p className="text-xs text-stone-500">Módulos e ações permitidas para o perfil {formData.role}.</p>
                </div>

                {formData.role !== 'OWNER' && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleRestoreDefaultPermissions}
                    className="text-xs"
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Restaurar Padrão ({formData.role})
                  </Button>
                )}
              </div>

              {formData.role === 'OWNER' && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-900 text-xs flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>O perfil <strong>OWNER</strong> possui acesso irrestrito a todas as funcionalidades do sistema.</span>
                </div>
              )}

              <div className="space-y-4">
                {CANONICAL_PERMISSIONS_CATALOG.map(module => {
                  const compatiblePerms = module.permissions.filter(p => 
                    formData.role === 'OWNER' || p.perfisCompativeis.includes(formData.role)
                  );

                  if (compatiblePerms.length === 0) return null;

                  const allModuleSelected = compatiblePerms.every(p => 
                    formData.permissions.includes(p.chave) || formData.role === 'OWNER'
                  );

                  return (
                    <div key={module.id} className="border border-stone-200 rounded-2xl p-4 bg-white shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 bg-stone-100 px-3 py-1 rounded-lg w-fit">
                          {module.name}
                        </h4>

                        {formData.role !== 'OWNER' && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleModuleToggle(compatiblePerms)}
                            className="text-[11px] min-h-[28px] h-7 px-2.5 py-1 font-bold rounded-lg"
                          >
                            {allModuleSelected ? 'Desmarcar Módulo' : 'Marcar Módulo'}
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {compatiblePerms.map(perm => {
                          const isChecked = formData.permissions.includes(perm.chave) || formData.role === 'OWNER';
                          const isDisabled = formData.role === 'OWNER';

                          const depTitles = perm.dependeDe
                            .map(depKey => CANONICAL_PERMISSIONS_MAP.get(depKey)?.titulo || depKey)
                            .filter(Boolean);

                          return (
                            <div
                              key={perm.chave}
                              onClick={() => !isDisabled && handlePermissionToggle(perm.chave)}
                              className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 relative ${
                                isChecked 
                                  ? 'border-emerald-500 bg-emerald-50/30 shadow-xs' 
                                  : 'border-stone-200 bg-stone-50/50 hover:bg-stone-100'
                              }`}
                            >
                              <Checkbox
                                checked={isChecked}
                                disabled={isDisabled}
                                onChange={() => {}}
                                className="pointer-events-none mt-0.5 shrink-0"
                              />
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between gap-1 flex-wrap">
                                  <p className="text-xs font-bold text-stone-800">{perm.titulo}</p>
                                  
                                  <div className="flex items-center gap-1">
                                    {perm.nivelRisco === 'critico' && (
                                      <Badge variant="danger" size="sm" className="text-[9px] px-1 py-0 h-4">
                                        Crítico
                                      </Badge>
                                    )}
                                    {perm.nivelRisco === 'alto' && (
                                      <Badge variant="warning" size="sm" className="text-[9px] px-1 py-0 h-4">
                                        Alto Risco
                                      </Badge>
                                    )}
                                    {perm.exigeConfirmacaoReforcada && (
                                      <Badge variant="info" size="sm" className="text-[9px] px-1 py-0 h-4" title="Exige confirmação reforçada">
                                        Confirmação
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                <p className="text-[11px] text-stone-500 leading-snug">{perm.descricao}</p>

                                {depTitles.length > 0 && (
                                  <p className="text-[10px] text-amber-700 bg-amber-100/60 px-1.5 py-0.5 rounded w-fit font-medium">
                                    Requer: {depTitles.join(', ')}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4: CONFIGURAÇÃO OPERACIONAL ADAPTATIVA */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-stone-100 pb-3">
                <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-emerald-600" />
                  Etapa 4: Configuração Operacional Específica ({formData.role})
                </h3>
                <p className="text-xs text-stone-500">Parâmetros adaptados às rotinas operacionais deste perfil.</p>
              </div>

              {/* 1. OWNER OPERATIONAL CONFIG */}
              {formData.role === 'OWNER' && (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-900 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>Configuração de Proprietário Principal com verificação e recuperação de acesso.</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="E-mail de Recuperação">
                      <TextInput
                        type="email"
                        value={formData.ownerConfig.recoveryEmail}
                        onChange={e => setFormData({
                          ...formData,
                          ownerConfig: { ...formData.ownerConfig, recoveryEmail: e.target.value }
                        })}
                        placeholder="proprietario.reserva@email.com"
                      />
                    </FormField>

                    <FormField label="Telefone de Segurança / Recuperação">
                      <TextInput
                        type="text"
                        value={formData.ownerConfig.recoveryPhone}
                        onChange={e => setFormData({
                          ...formData,
                          ownerConfig: { ...formData.ownerConfig, recoveryPhone: maskPhone(e.target.value) }
                        })}
                        placeholder="(11) 99999-9999"
                      />
                    </FormField>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-stone-50 border border-stone-200 rounded-2xl">
                    <div>
                      <h4 className="text-xs font-bold text-stone-800">Proprietário Principal do Restaurante</h4>
                      <p className="text-[11px] text-stone-500">Representante legal da unidade.</p>
                    </div>
                    <Checkbox
                      checked={formData.ownerConfig.isMainOwner}
                      onChange={checked => setFormData({
                        ...formData,
                        ownerConfig: { ...formData.ownerConfig, isMainOwner: checked }
                      })}
                    />
                  </div>
                </div>
              )}

              {/* 2. RESTAURANT_ADMIN OPERATIONAL CONFIG */}
              {formData.role === 'RESTAURANT_ADMIN' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { key: 'accessFinancial', label: 'Acesso Financeiro Completo' },
                      { key: 'accessSettings', label: 'Acesso a Configurações da Loja' },
                      { key: 'accessTeam', label: 'Acesso à Gestão de Equipe' },
                      { key: 'accessProducts', label: 'Acesso ao Cardápio e Preços' },
                      { key: 'accessOrders', label: 'Acesso à Operação de Pedidos' },
                      { key: 'accessStock', label: 'Acesso à Gestão de Estoque' },
                      { key: 'accessReports', label: 'Acesso a Relatórios Gerenciais' }
                    ].map(item => (
                      <div key={item.key} className="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-800">{item.label}</span>
                        <Checkbox
                          checked={(formData.adminConfig as any)[item.key]}
                          onChange={checked => setFormData({
                            ...formData,
                            adminConfig: { ...formData.adminConfig, [item.key]: checked }
                          })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. MANAGER OPERATIONAL CONFIG */}
              {formData.role === 'MANAGER' && (
                <div className="space-y-4">
                  <FieldGroup cols={2}>
                    <FormField label="Limite Máximo de Desconto (%)">
                      <TextInput
                        type="number"
                        min={0}
                        max={100}
                        value={formData.managerConfig.maxDiscountPercentage}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            managerConfig: { ...formData.managerConfig, maxDiscountPercentage: parseFloat(e.target.value) || 0 }
                          })
                        }
                      />
                    </FormField>

                    <FormField label="Ambientes Gerenciados">
                      <TextInput
                        type="text"
                        value={formData.managerConfig.managedEnvironments.join(', ')}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            managerConfig: {
                              ...formData.managerConfig,
                              managedEnvironments: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                            }
                          })
                        }
                        placeholder="Salão Principal, Varanda, Delivery"
                      />
                    </FormField>
                  </FieldGroup>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { key: 'allowDiscounts', label: 'Pode Autorizar Descontos' },
                      { key: 'allowCancellations', label: 'Pode Autorizar Cancelamentos' },
                      { key: 'allowRegisterOpenClose', label: 'Pode Abrir e Fechar Caixas' },
                      { key: 'manageOrders', label: 'Gestão de Pedidos do Turno' },
                      { key: 'manageStock', label: 'Gestão e Baixas de Estoque' },
                      { key: 'manageTeam', label: 'Gestão da Equipe do Turno' }
                    ].map((item) => (
                      <Switch
                        key={item.key}
                        label={item.label}
                        checked={(formData.managerConfig as any)[item.key]}
                        onChange={(checked) =>
                          setFormData({
                            ...formData,
                            managerConfig: { ...formData.managerConfig, [item.key]: checked }
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 4. WAITER OPERATIONAL CONFIG */}
              {formData.role === 'WAITER' && (
                <div className="space-y-4">
                  <FieldGroup cols={3}>
                    <FormField label="PIN Operacional (4-6 dígitos)" required>
                      <TextInput
                        type="password"
                        maxLength={6}
                        value={formData.waiterConfig.pinCode}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            waiterConfig: { ...formData.waiterConfig, pinCode: e.target.value.replace(/\D/g, '') }
                          })
                        }
                        placeholder="Ex: 1234"
                      />
                    </FormField>

                    <FormField label="Comissão (%)">
                      <TextInput
                        type="number"
                        min={0}
                        max={100}
                        value={formData.waiterConfig.commissionRate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            waiterConfig: { ...formData.waiterConfig, commissionRate: parseFloat(e.target.value) || 0 }
                          })
                        }
                      />
                    </FormField>

                    <FormField label="Limite de Desconto (%)">
                      <TextInput
                        type="number"
                        min={0}
                        max={100}
                        value={formData.waiterConfig.maxDiscountPercentage}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            waiterConfig: { ...formData.waiterConfig, maxDiscountPercentage: parseFloat(e.target.value) || 0 }
                          })
                        }
                      />
                    </FormField>
                  </FieldGroup>

                  <FormField label="Ambientes Atendidos (separados por vírgula)">
                    <TextInput
                      type="text"
                      value={formData.waiterConfig.attendedHalls.join(', ')}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          waiterConfig: {
                            ...formData.waiterConfig,
                            attendedHalls: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                          }
                        })
                      }
                      placeholder="Salão Principal, Varanda, Deck"
                    />
                  </FormField>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { key: 'createOrders', label: 'Pode Abrir Comandas / Mesas' },
                      { key: 'transferTable', label: 'Pode Transferir Mesas' },
                      { key: 'applyDiscount', label: 'Pode Aplicar Desconto' },
                      { key: 'cancelUnsentItems', label: 'Pode Cancelar Item Não Enviado' },
                      { key: 'cancelSentItems', label: 'Pode Cancelar Item Já Enviado' },
                      { key: 'closeTable', label: 'Pode Fechar Conta / Pré-Fechamento' },
                      { key: 'viewFinancialTotals', label: 'Pode Visualizar Valores Totais' }
                    ].map(item => (
                      <div key={item.key} className="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-800">{item.label}</span>
                        <Checkbox
                          checked={(formData.waiterConfig as any)[item.key]}
                          onChange={checked => setFormData({
                            ...formData,
                            waiterConfig: { ...formData.waiterConfig, [item.key]: checked }
                          })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. DRIVER OPERATIONAL CONFIG */}
              {formData.role === 'DRIVER' && (
                <div className="space-y-4">
                  <FieldGroup cols={3}>
                    <FormField label="Apelido do Entregador">
                      <TextInput
                        type="text"
                        value={formData.driverConfig.nickname}
                        onChange={e => setFormData({
                          ...formData,
                          driverConfig: { ...formData.driverConfig, nickname: e.target.value }
                        })}
                        placeholder="Ex: Paulinho Moto"
                      />
                    </FormField>

                    <FormField label="CPF">
                      <TextInput
                        type="text"
                        value={formData.driverConfig.cpf}
                        onChange={e => setFormData({
                          ...formData,
                          driverConfig: { ...formData.driverConfig, cpf: maskCPF(e.target.value) }
                        })}
                        placeholder="000.000.000-00"
                      />
                    </FormField>

                    <FormField label="Tipo de Veículo">
                      <SelectInput
                        value={formData.driverConfig.vehicleType}
                        onChange={e => setFormData({
                          ...formData,
                          driverConfig: { ...formData.driverConfig, vehicleType: e.target.value as any }
                        })}
                      >
                        <option value="moto">Motocicleta</option>
                        <option value="carro">Carro / Utilitário</option>
                        <option value="bicicleta">Bicicleta</option>
                        <option value="a_pe">A Pé</option>
                      </SelectInput>
                    </FormField>

                    <FormField label="Placa do Veículo">
                      <TextInput
                        type="text"
                        value={formData.driverConfig.vehiclePlate}
                        onChange={e => setFormData({
                          ...formData,
                          driverConfig: { ...formData.driverConfig, vehiclePlate: maskPlate(e.target.value) }
                        })}
                        placeholder="ABC-1D23"
                        className="uppercase"
                      />
                    </FormField>

                    <FormField label="CNH">
                      <TextInput
                        type="text"
                        value={formData.driverConfig.cnh}
                        onChange={e => setFormData({
                          ...formData,
                          driverConfig: { ...formData.driverConfig, cnh: e.target.value }
                        })}
                        placeholder="Número da CNH"
                      />
                    </FormField>

                    <FormField label="Chave Pix">
                      <TextInput
                        type="text"
                        value={formData.driverConfig.pixKey}
                        onChange={e => setFormData({
                          ...formData,
                          driverConfig: { ...formData.driverConfig, pixKey: e.target.value }
                        })}
                        placeholder="CPF, Celular ou E-mail"
                      />
                    </FormField>

                    <FormField label="Forma de Remuneração">
                      <SelectInput
                        value={formData.driverConfig.remunerationType}
                        onChange={e => setFormData({
                          ...formData,
                          driverConfig: { ...formData.driverConfig, remunerationType: e.target.value as any }
                        })}
                      >
                        <option value="FIXED_PER_DELIVERY">Taxa Fixa por Entrega</option>
                        <option value="DAILY_PLUS_FEE">Diária + Taxa</option>
                        <option value="PERCENTAGE">Porcentagem sobre a Entrega</option>
                      </SelectInput>
                    </FormField>

                    <FormField label="Valor / Taxa (R$)">
                      <TextInput
                        type="number"
                        step="0.50"
                        value={formData.driverConfig.remunerationValue}
                        onChange={e => setFormData({
                          ...formData,
                          driverConfig: { ...formData.driverConfig, remunerationValue: parseFloat(e.target.value) || 0 }
                        })}
                      />
                    </FormField>

                    <FormField label="Raio de Atendimento (km)">
                      <TextInput
                        type="number"
                        value={formData.driverConfig.deliveryRadiusKm}
                        onChange={e => setFormData({
                          ...formData,
                          driverConfig: { ...formData.driverConfig, deliveryRadiusKm: parseInt(e.target.value) || 0 }
                        })}
                      />
                    </FormField>
                  </FieldGroup>

                  <div className="flex items-center justify-between p-4 bg-stone-50 border border-stone-200 rounded-2xl">
                    <div>
                      <h4 className="text-xs font-bold text-stone-800">Compartilhamento de Localização GPS em Tempo Real</h4>
                      <p className="text-[11px] text-stone-500">Exibir deslocamento do entregador para a loja e cliente.</p>
                    </div>
                    <Checkbox
                      checked={formData.driverConfig.locationSharing}
                      onChange={checked => setFormData({
                        ...formData,
                        driverConfig: { ...formData.driverConfig, locationSharing: checked }
                      })}
                    />
                  </div>
                </div>
              )}

              {/* 6. CASHIER OPERATIONAL CONFIG */}
              {formData.role === 'CASHIER' && (
                <div className="space-y-4">
                  <FieldGroup cols={2}>
                    <FormField label="PIN Operacional do Caixa (4-6 dígitos)" required>
                      <TextInput
                        type="password"
                        maxLength={6}
                        value={formData.cashierConfig.pinCode}
                        onChange={e => setFormData({
                          ...formData,
                          cashierConfig: { ...formData.cashierConfig, pinCode: e.target.value.replace(/\D/g, '') }
                        })}
                        placeholder="Ex: 8899"
                      />
                    </FormField>

                    <FormField label="Limite de Desconto Autorizado (%)">
                      <TextInput
                        type="number"
                        min={0}
                        max={100}
                        value={formData.cashierConfig.maxDiscountPercentage}
                        onChange={e => setFormData({
                          ...formData,
                          cashierConfig: { ...formData.cashierConfig, maxDiscountPercentage: parseFloat(e.target.value) || 0 }
                        })}
                      />
                    </FormField>
                  </FieldGroup>

                  <FormField label="Caixas Autorizados (separados por vírgula)">
                    <TextInput
                      type="text"
                      value={formData.cashierConfig.authorizedRegisters.join(', ')}
                      onChange={e => setFormData({
                        ...formData,
                        cashierConfig: {
                          ...formData.cashierConfig,
                          authorizedRegisters: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                        }
                      })}
                      placeholder="Caixa 01, Caixa 02, Delivery Central"
                    />
                  </FormField>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { key: 'canOpenRegister', label: 'Pode Abrir Caixa' },
                      { key: 'canCloseRegister', label: 'Pode Fechar Caixa' },
                      { key: 'canSangria', label: 'Pode Realizar Sangrias' },
                      { key: 'canSuprimento', label: 'Pode Realizar Suprimentos' },
                      { key: 'canApplyDiscount', label: 'Pode Aplicar Desconto' },
                      { key: 'canCancelSale', label: 'Pode Cancelar Venda' },
                      { key: 'canRefund', label: 'Pode Estornar Pagamento' }
                    ].map(item => (
                      <div key={item.key} className="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-800">{item.label}</span>
                        <Checkbox
                          checked={(formData.cashierConfig as any)[item.key]}
                          onChange={checked => setFormData({
                            ...formData,
                            cashierConfig: { ...formData.cashierConfig, [item.key]: checked }
                          })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 7. KITCHEN OPERATIONAL CONFIG */}
              {formData.role === 'KITCHEN' && (
                <div className="space-y-4">
                  <FieldGroup cols={2}>
                    <FormField label="Estações de Produção (separadas por vírgula)">
                      <TextInput
                        type="text"
                        value={formData.kitchenConfig.productionStations.join(', ')}
                        onChange={e => setFormData({
                          ...formData,
                          kitchenConfig: {
                            ...formData.kitchenConfig,
                            productionStations: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                          }
                        })}
                        placeholder="Chapa, Fritadeira, Forno, Saladas"
                      />
                    </FormField>

                    <FormField label="Impressora / KDS Associado">
                      <TextInput
                        type="text"
                        value={formData.kitchenConfig.associatedKdsPrinter}
                        onChange={e => setFormData({
                          ...formData,
                          kitchenConfig: { ...formData.kitchenConfig, associatedKdsPrinter: e.target.value }
                        })}
                        placeholder="KDS Cozinha Principal"
                      />
                    </FormField>
                  </FieldGroup>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { key: 'canAcceptOrder', label: 'Pode Aceitar Pedido' },
                      { key: 'canStartPrep', label: 'Pode Iniciar Preparo' },
                      { key: 'canFinishItem', label: 'Pode Concluir Prato' },
                      { key: 'canChangePriority', label: 'Pode Alterar Prioridade na Fila' },
                      { key: 'canViewValues', label: 'Exibir Preços/Valores dos Itens' },
                      { key: 'soundAlerts', label: 'Alertas Sonoros para Novos Pedidos' }
                    ].map(item => (
                      <div key={item.key} className="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-800">{item.label}</span>
                        <Checkbox
                          checked={(formData.kitchenConfig as any)[item.key]}
                          onChange={checked => setFormData({
                            ...formData,
                            kitchenConfig: { ...formData.kitchenConfig, [item.key]: checked }
                          })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: REVISÃO E CONFIRMAÇÃO */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-stone-100 pb-3">
                <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  Etapa 5: Revisão e Confirmação do Cadastro
                </h3>
                <p className="text-xs text-stone-500">Confira o resumo completo antes de efetivar o salvamento.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Summary Card 1 */}
                <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">Dados Pessoais & Login</h4>
                  <p className="text-sm font-bold text-stone-800">{formData.nome}</p>
                  <p className="text-xs text-stone-600">Exibição: <strong>{formData.displayName}</strong></p>
                  <p className="text-xs text-stone-600">E-mail: <strong>{formData.email}</strong></p>
                  <p className="text-xs text-stone-600">Telefone: <strong>{formData.phone}</strong></p>
                  {formData.jobTitle && <p className="text-xs text-stone-600">Cargo: <strong>{formData.jobTitle}</strong></p>}
                </div>

                {/* Summary Card 2 */}
                <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">Perfil & Acesso</h4>
                  <p className="text-sm font-bold text-stone-800">Perfil: <span className="text-emerald-600">{formData.role}</span></p>
                  <p className="text-xs text-stone-600">Status: <strong>{formData.status}</strong></p>
                  <p className="text-xs text-stone-600">Trocar senha no 1º login: <strong>{formData.mustChangePassword ? 'Sim' : 'Não'}</strong></p>
                  <p className="text-xs text-stone-600">Permissões ativas: <strong>{formData.permissions.length} módulos/ações</strong></p>
                </div>
              </div>

              {/* Summary Card 3 - Operational Config */}
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">Resumo da Configuração Operacional ({formData.role})</h4>
                
                {formData.role === 'WAITER' && (
                  <div className="text-xs text-stone-700 space-y-1">
                    <p>PIN Operacional: <strong>{formData.waiterConfig.pinCode ? '****' : 'Não definido'}</strong></p>
                    <p>Comissão: <strong>{formData.waiterConfig.commissionRate}%</strong></p>
                    <p>Salões atendidos: <strong>{formData.waiterConfig.attendedHalls.join(', ') || 'Todos'}</strong></p>
                  </div>
                )}

                {formData.role === 'DRIVER' && (
                  <div className="text-xs text-stone-700 space-y-1">
                    <p>Veículo: <strong>{formData.driverConfig.vehicleType.toUpperCase()}</strong> (Placa: {formData.driverConfig.vehiclePlate || 'N/A'})</p>
                    <p>Remuneração: <strong>{formData.driverConfig.remunerationType}</strong> ({formatCurrency(formData.driverConfig.remunerationValue)})</p>
                  </div>
                )}

                {formData.role === 'CASHIER' && (
                  <div className="text-xs text-stone-700 space-y-1">
                    <p>PIN Caixa: <strong>{formData.cashierConfig.pinCode ? '****' : 'Não definido'}</strong></p>
                    <p>Caixas: <strong>{formData.cashierConfig.authorizedRegisters.join(', ')}</strong></p>
                  </div>
                )}

                {formData.role === 'KITCHEN' && (
                  <div className="text-xs text-stone-700 space-y-1">
                    <p>Estações: <strong>{formData.kitchenConfig.productionStations.join(', ')}</strong></p>
                    <p>KDS/Impressora: <strong>{formData.kitchenConfig.associatedKdsPrinter || 'Geral'}</strong></p>
                  </div>
                )}

                {formData.role === 'MANAGER' && (
                  <div className="text-xs text-stone-700 space-y-1">
                    <p>Limite de Desconto: <strong>{formData.managerConfig.maxDiscountPercentage}%</strong></p>
                    <p>Ambientes: <strong>{formData.managerConfig.managedEnvironments.join(', ')}</strong></p>
                  </div>
                )}

                {['OWNER', 'RESTAURANT_ADMIN'].includes(formData.role) && (
                  <p className="text-xs text-stone-700">Acesso administrativo expandido configurado com sucesso.</p>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer / Navigation Controls */}
        <div className="sticky bottom-0 bg-white border-t border-stone-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 z-10">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSaveDraft}
              className="w-full sm:w-auto justify-center"
              icon={<Save className="w-3.5 h-3.5" />}
            >
              Salvar Rascunho
            </Button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {currentStep > 1 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handlePrevStep}
                className="w-full sm:w-auto justify-center"
                icon={<ArrowLeft className="w-4 h-4" />}
              >
                Voltar
              </Button>
            )}

            {currentStep < 5 ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleNextStep}
                className="w-full sm:w-auto justify-center"
                icon={<ArrowRight className="w-4 h-4" />}
                iconPosition="right"
              >
                Avançar
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={actionLoading}
                loading={actionLoading}
                onClick={handleFinalSubmit}
                className="w-full sm:w-auto justify-center"
                icon={<CheckCircle className="w-4 h-4" />}
              >
                {editingMember ? 'Salvar Alterações' : 'Confirmar e Cadastrar'}
              </Button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
