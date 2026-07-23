import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, UserPlus, Phone, Mail, Lock, User, FileText, Check,
  Bike, Car, Compass, Smile, Info, ArrowLeft, Loader2, AlertCircle, Eye, EyeOff, Copy
} from 'lucide-react';
import { auth } from '../../../firebase';
import { motion } from 'motion/react';

export default function RegisterDriver() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ email: string; password?: string; name: string } | null>(null);

  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    nickname: '',
    phone: '',
    email: '',
    password: '',
    cpf: '',
    vehicleType: 'moto' as 'moto' | 'bicicleta' | 'carro' | 'a_pe',
    vehiclePlate: '',
    observations: '',
    active: true
  });

  const [copied, setCopied] = useState(false);

  const handleCopyCredentials = () => {
    if (!successData) return;
    const shareText = `Olá ${successData.name}! Você foi cadastrado como entregador no app. Aqui estão seus dados de acesso:\n\n📧 E-mail: ${successData.email}\n🔑 Senha: ${successData.password || '[A senha definida]'}\n\nBaixe o aplicativo para começar as entregas!`;
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let pass = '';
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password: pass }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Não autenticado. Por favor, efetue login novamente.');

      const response = await fetch('/api/restaurant/drivers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao registrar entregador');
      }

      setSuccessData({
        email: formData.email,
        password: formData.password,
        name: formData.name
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao cadastrar entregador');
    } finally {
      setLoading(false);
    }
  };

  if (successData) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 font-sans">
        <div className="bg-white rounded-[2rem] border border-stone-200 p-8 text-center shadow-xl shadow-stone-100">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-650 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 stroke-[3]" />
          </div>
          <h2 className="text-2xl font-bold text-stone-800 mb-2">Entregador Cadastrado!</h2>
          <p className="text-stone-500 text-sm max-w-md mx-auto mb-8">
            O entregador <strong className="text-stone-700">{successData.name}</strong> foi adicionado com sucesso ao seu restaurante e seu cadastro foi criado.
          </p>

          <div className="bg-stone-50 border border-stone-200 rounded-3xl p-6 text-left max-w-md mx-auto space-y-3 mb-8 relative">
            <h4 className="text-stone-800 text-xs font-bold uppercase tracking-wider mb-2">Dados de Acesso (Copie para enviar)</h4>
            <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-stone-150 text-sm">
              <span className="text-stone-500 font-medium select-all">E-mail:</span>
              <strong className="text-stone-800">{successData.email}</strong>
            </div>
            <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-stone-150 text-sm">
              <span className="text-stone-500 font-medium select-all">Senha provisória:</span>
              <strong className="text-stone-800 font-mono tracking-wider">{successData.password || '[Senha definida]'}</strong>
            </div>

            <button
              onClick={handleCopyCredentials}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-stone-200 hover:bg-stone-300 transition-all font-bold text-stone-700 text-xs rounded-xl mt-4"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-650" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiado para área de transferência!' : 'Copiar Convite e Credenciais'}</span>
            </button>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => {
                setSuccessData(null);
                setFormData({
                  name: '',
                  nickname: '',
                  phone: '',
                  email: '',
                  password: '',
                  cpf: '',
                  vehicleType: 'moto',
                  vehiclePlate: '',
                  observations: '',
                  active: true
                });
              }}
              className="px-5 py-3 border border-stone-200 hover:bg-stone-50 transition-all font-bold text-stone-700 rounded-2xl text-sm"
            >
              Cadastrar Outro
            </button>
            <button
              onClick={() => navigate('/restaurant/drivers')}
              className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all text-sm"
            >
              Ir para Lista
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 font-sans">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/restaurant/drivers')}
          className="p-3 bg-stone-50 hover:bg-stone-100 rounded-2xl border border-stone-200 text-stone-600 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Cadastrar Entregador</h2>
          <p className="text-stone-500 text-sm">Crie um novo cadastro de motorista/entregador vinculado ao seu restaurante.</p>
        </div>
      </div>

      <form onSubmit={handleFormSubmit} className="bg-white rounded-[2rem] border border-stone-200 p-6 sm:p-8 space-y-6 shadow-sm">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-sm text-red-700 animate-fadeIn">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-stone-800 font-bold text-base border-b border-stone-100 pb-2">Informações Pessoais</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-stone-600 text-xs font-bold">Nome completo do Entregador *</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-stone-400" />
                <input
                  type="text"
                  required
                  placeholder="Nome completo..."
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-stone-600 text-xs font-bold">Apelido (Como é conhecido)</label>
              <input
                type="text"
                placeholder="Ex. Rafinha, Dedé..."
                value={formData.nickname}
                onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-stone-600 text-xs font-bold">WhatsApp do Entregador *</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-stone-400" />
                <input
                  type="text"
                  required
                  placeholder="(00) 00000-0000"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-stone-600 text-xs font-bold">CPF (Opcional)</label>
              <div className="relative">
                <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-stone-400" />
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  value={formData.cpf}
                  onChange={(e) => setFormData(prev => ({ ...prev, cpf: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-stone-800 font-bold text-base border-b border-stone-100 pb-2">Informações de Acesso</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-stone-600 text-xs font-bold">E-mail de Login *</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-stone-400" />
                <input
                  type="email"
                  required
                  placeholder="nome@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-stone-600 text-xs font-bold">Senha temporária de acesso *</label>
                <button
                  type="button"
                  onClick={generatePassword}
                  className="text-emerald-600 hover:text-emerald-700 text-xs font-bold"
                >
                  Gerar Automática
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-stone-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full pl-10 pr-10 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-all"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-stone-800 font-bold text-base border-b border-stone-100 pb-2">Veículo de Entregas</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-stone-600 text-xs font-bold">Tipo de combustível/veículo *</label>
              <select
                required
                value={formData.vehicleType}
                onChange={(e) => setFormData(prev => ({ ...prev, vehicleType: e.target.value as any }))}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium transition-all"
              >
                <option value="moto">Moto (Padrão)</option>
                <option value="bicicleta">Bicicleta</option>
                <option value="carro">Carro</option>
                <option value="a_pe">A Pé</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-stone-600 text-xs font-bold">Placa do veículo (Opcional se moto/carro)</label>
              <input
                type="text"
                placeholder="Ex. ABC-1234"
                value={formData.vehiclePlate}
                onChange={(e) => setFormData(prev => ({ ...prev, vehiclePlate: e.target.value }))}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium transition-all"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-stone-600 text-xs font-bold">Observações Internas</label>
            <textarea
              rows={3}
              placeholder="Ex. Horários de preferência, observações da moto ou restrições..."
              value={formData.observations}
              onChange={(e) => setFormData(prev => ({ ...prev, observations: e.target.value }))}
              className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 bg-emerald-50/50 border border-emerald-100 rounded-3xl">
          <input
            type="checkbox"
            id="active"
            checked={formData.active}
            onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.checked }))}
            className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
          />
          <label htmlFor="active" className="text-xs sm:text-sm text-stone-700 font-medium cursor-pointer">
            Ativar entregador imediatamente ao cadastrar (Permite login e recebimento de pedidos)
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-stone-100">
          <button
            type="button"
            onClick={() => navigate('/restaurant/drivers')}
            className="px-6 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold rounded-2xl transition-all text-sm"
          >
            Cancelar
          </button>
          
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-450 text-white font-bold rounded-2xl transition-all text-sm shadow-md shadow-emerald-100"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{loading ? 'Cadastrando...' : 'Finalizar Cadastro'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
