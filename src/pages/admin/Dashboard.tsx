import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { collection, query, doc, setDoc, addDoc, deleteDoc, serverTimestamp, updateDoc, where, collectionGroup, getDocs, getDoc, limit, orderBy, startAfter, QueryConstraint } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage, handleFirestoreError, OperationType } from '../../firebase';
import { getReports } from '../../services/reportService';
import { scheduleService } from '../../services/scheduleService';
import { isRestaurantOpen } from '../../utils/restaurantStatus';
import { validateCPF, validateCNPJ, formatCPF, formatCNPJ } from '../../utils/validation';
import ImageUpload from '../../components/ImageUpload';
import { LayoutDashboard, Store, Users, ShoppingBag, Tag, Map, Flag, LogOut, Check, X, Calendar, ChevronDown, Bell, Image as ImageIcon, Plus, Box, Package, Trash2, Shield, AlertTriangle, BarChart3, Search, Filter, Eye, Edit, Edit3, Upload, Link as LinkIcon, Phone, Mail, Instagram, Globe, Clock, MapPin, AlertCircle, Loader2, Save, Bike, CheckCircle2, CreditCard, User, RefreshCw, FileText, DollarSign, Settings2, PlusCircle, List, Percent } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

import AdminLayout from '../../layouts/AdminLayout';
import RestaurantForm from '../../components/admin/RestaurantForm';
import DeliveryAreas from '../restaurant/DeliveryAreas';
import Schedules from '../restaurant/Schedules';
import RestaurantCategories from '../restaurant/Categories';
import RestaurantExtras from '../restaurant/Extras';
import RestaurantProducts from '../restaurant/Products';
import RestaurantSizes from '../restaurant/Sizes';
import OptionGroups from '../restaurant/OptionGroups';
import RestaurantPromotions from '../restaurant/Promotions';
import FinancePage from './Finance';
import { ReportsDashboard } from '../../components/admin/ReportsDashboard';

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'year' | 'all';

export default function AdminDashboard() {
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Push a state to history to prevent back button from exiting the app
    window.history.pushState(null, '', window.location.pathname);

    const handlePopState = () => {
      // When back is pressed, push the state again to stay on Home
      window.history.pushState(null, '', window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const fetchAdminData = useCallback(async () => {
    try {
      const [resSnap, userSnap, orderSnap, catSnap, prodSnap] = await Promise.all([
        getDocs(query(collection(db, 'restaurants'), limit(200))),
        getDocs(query(collection(db, 'users'), limit(200))),
        getDocs(query(collectionGroup(db, 'orders'), orderBy('data_criacao', 'desc'), limit(300))),
        getDocs(query(collection(db, 'categories'), limit(100))),
        getDocs(query(collectionGroup(db, 'products'), limit(500)))
      ]);

      setRestaurants(resSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setOrders(orderSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProducts(prodSnap.docs.map(d => ({ id: d.id, restaurante_id: d.ref.parent.parent?.id, ...d.data() })));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'admin_dashboard_data');
    }
  }, []);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  const getFilteredData = (items: any[], dateField: string) => {
    const now = new Date();
    let start = new Date(0);
    let end = new Date();

    if (period === 'today') {
      start = new Date();
      start.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
      start = new Date(now.getFullYear(), 0, 1);
    } else if (period === 'custom') {
      if (customRange.start) {
        start = new Date(customRange.start);
        start.setHours(0, 0, 0, 0);
      }
      if (customRange.end) {
        end = new Date(customRange.end);
        end.setHours(23, 59, 59, 999);
      }
    } else if (period === 'all') {
      return items;
    }

    return items.filter(item => {
      const itemDate = new Date(item[dateField]);
      return itemDate >= start && itemDate <= end;
    });
  };

  const filteredOrders = useMemo(() => getFilteredData(orders, 'data_criacao'), [orders, period, customRange]);
  const filteredUsers = useMemo(() => getFilteredData(users, 'data_criacao'), [users, period, customRange]);
  const filteredRestaurants = useMemo(() => getFilteredData(restaurants, 'data_criacao'), [restaurants, period, customRange]);

  const periodLabels: Record<Period, string> = {
    today: 'Hoje',
    yesterday: 'Ontem',
    week: 'Esta Semana',
    month: 'Este Mês',
    year: 'Este Ano',
    custom: 'Personalizado',
    all: 'Todo o Período'
  };

  const pendingRestaurantsCount = restaurants.filter(r => r.status_aprovacao === 'pendente_aprovacao').length;

  return (
    <AdminLayout pendingRestaurantsCount={pendingRestaurantsCount}>
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stone-800">Visão Geral</h1>
          <p className="text-stone-500">Bem-vindo ao centro de controle do Qfomeai.</p>
        </div>

          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
            <button
              onClick={fetchAdminData}
              className="p-3 bg-white border border-stone-200 text-stone-600 rounded-2xl hover:bg-stone-50 transition-all shadow-sm"
              title="Atualizar dados"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            {period === 'custom' && (
              <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-stone-200 shadow-sm">
                <input 
                  type="date" 
                  value={customRange.start}
                  onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                  className="text-xs font-bold text-stone-600 focus:outline-none"
                />
                <span className="text-stone-300">|</span>
                <input 
                  type="date" 
                  value={customRange.end}
                  onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
                  className="text-xs font-bold text-stone-600 focus:outline-none"
                />
              </div>
            )}

            <div className="relative">
              <button 
                onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
                className="flex items-center gap-2 px-4 py-3 bg-white border border-stone-200 rounded-2xl font-bold text-stone-700 hover:border-emerald-500 transition-all shadow-sm"
              >
                <Calendar className="w-5 h-5 text-emerald-600" />
                <span>{periodLabels[period]}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showPeriodDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showPeriodDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-stone-200 rounded-2xl shadow-xl z-50 overflow-hidden py-1">
                  {(Object.keys(periodLabels) as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setPeriod(p);
                        setShowPeriodDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-3 text-sm font-bold transition-colors ${period === p ? 'bg-emerald-50 text-emerald-600' : 'text-stone-600 hover:bg-stone-50'}`}
                    >
                      {periodLabels[p]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <Routes>
          <Route path="/" element={<AdminStats restaurants={filteredRestaurants} users={filteredUsers} orders={filteredOrders} />} />
          <Route path="restaurantes" element={<RestaurantManagement restaurants={restaurants} categories={categories} />} />
          <Route path="usuarios" element={<UserManagement users={users} orders={orders} />} />
          <Route path="pedidos" element={<OrderManagement restaurants={restaurants} users={users} />} />
          <Route path="financeiro" element={<FinancePage />} />
          <Route path="bairros" element={<LocationManagement />} />
          <Route path="cupons" element={<CouponManagement restaurants={restaurants} categories={categories} products={products} />} />
          <Route path="banners" element={<BannerManagement />} />
          <Route path="categorias" element={<CategoryManagement />} />
          <Route path="denuncias" element={<ReportManagement users={users} restaurants={restaurants} orders={orders} />} />
          <Route path="notificacoes" element={<PushNotificationManagement />} />
          <Route path="relatorios" element={<ReportsDashboard />} />
        </Routes>
      </AdminLayout>
    );
  }

function UserManagement({ users, orders }: any) {
  const [selectedUserOrders, setSelectedUserOrders] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    try {
      await setDoc(doc(db, 'users', id), {
        status_conta: currentStatus === 'ativo' ? 'bloqueado' : 'ativo'
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${id}`);
    }
  };

  const handleChangeRole = async (id: string, newRole: string) => {
    try {
      await setDoc(doc(db, 'users', id), {
        tipo_usuario: newRole
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${id}`);
    }
  };

  const viewOrderHistory = (userId: string) => {
    const userOrders = orders.filter((o: any) => o.usuario_id === userId);
    setSelectedUserOrders({ userId, orders: userOrders });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSaveLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: editingUser.nome,
          email: editingUser.email,
          telefone: editingUser.telefone,
          tipo_usuario: editingUser.tipo_usuario,
          status_conta: editingUser.status_conta
        })
      });

      let errorMessage = 'Erro ao atualizar usuário';
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const err = await response.json();
        errorMessage = err.error || errorMessage;
      }

      if (!response.ok) {
        throw new Error(errorMessage);
      }

      setEditingUser(null);
    } catch (error: any) {
      alert(error.message);
      console.error(error);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUserId) return;
    setSaveLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${deletingUserId}`, {
        method: 'DELETE'
      });

      let errorMessage = 'Erro ao excluir usuário';
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const err = await response.json();
        errorMessage = err.error || errorMessage;
      } else {
        // Se não for JSON, provavelmente é um erro de servidor retornando HTML
        if (response.status === 403) {
          errorMessage = 'Acesso negado. Verifique se a Identity Toolkit API está ativa no Google Cloud.';
        }
      }

      if (!response.ok) {
        throw new Error(errorMessage);
      }

      // setUsers(prev => prev.filter(u => u.id !== deletingUserId));
      setDeletingUserId(null);
    } catch (error: any) {
      alert(error.message);
      console.error(error);
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-stone-800">Gerenciar Usuários</h2>
      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[300px]">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="p-4 font-bold text-stone-600">Usuário</th>
                <th className="p-4 font-bold text-stone-600 hidden sm:table-cell">Tipo</th>
                <th className="p-4 font-bold text-stone-600 hidden sm:table-cell">Status</th>
                <th className="p-4 font-bold text-stone-600 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: any) => (
                <tr key={user.id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                  <td className="p-4">
                    <p className="font-bold text-stone-800">{user.nome}</p>
                    <p className="text-xs text-stone-500">{user.email}</p>
                    <div className="sm:hidden mt-2 flex items-center gap-2">
                      <select 
                        value={user.tipo_usuario}
                        onChange={(e) => handleChangeRole(user.id, e.target.value)}
                        className="bg-stone-100 border-none rounded-lg text-[10px] font-bold p-1"
                      >
                        <option value="cliente">Cliente</option>
                        <option value="restaurante">Restaurante</option>
                        <option value="admin">Admin</option>
                      </select>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${user.status_conta === 'ativo' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                        {user.status_conta}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 hidden sm:table-cell">
                    <select 
                      value={user.tipo_usuario}
                      onChange={(e) => handleChangeRole(user.id, e.target.value)}
                      className="bg-stone-100 border-none rounded-lg text-xs font-bold p-1 focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="cliente">Cliente</option>
                      <option value="restaurante">Restaurante</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="p-4 hidden sm:table-cell">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${user.status_conta === 'ativo' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                      {user.status_conta}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button 
                        onClick={() => viewOrderHistory(user.id)}
                        className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                        title="Histórico de Pedidos"
                      >
                        <ShoppingBag className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => setEditingUser(user)}
                        className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Editar Usuário"
                      >
                        <Edit3 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleToggleStatus(user.id, user.status_conta)}
                        className={`p-2 rounded-lg transition-all ${user.status_conta === 'ativo' ? 'text-red-500 hover:bg-red-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                        title={user.status_conta === 'ativo' ? 'Bloquear' : 'Ativar'}
                      >
                        {user.status_conta === 'ativo' ? <X className="w-5 h-5" /> : <Check className="w-5 h-5" />}
                      </button>
                      <button 
                        onClick={() => setDeletingUserId(user.id)}
                        className="p-2 text-stone-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Excluir Permanentemente"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Histórico de Pedidos */}
      {selectedUserOrders && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
              <h3 className="text-xl font-bold text-stone-800">Histórico de Pedidos</h3>
              <button onClick={() => setSelectedUserOrders(null)} className="p-2 hover:bg-stone-200 rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              {selectedUserOrders.orders.length === 0 ? (
                <p className="text-center text-stone-400 py-8">Nenhum pedido encontrado para este usuário.</p>
              ) : (
                selectedUserOrders.orders.map((order: any) => (
                  <div key={order.id} className="p-4 border border-stone-100 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="font-bold text-stone-800">Pedido #{order.id.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-stone-500">{new Date(order.data_criacao).toLocaleString()}</p>
                      <p className="text-xs font-bold text-emerald-600 mt-1">{order.restaurant_nome || order.restaurante_nome || 'Restaurante não identificado'}</p>
                      <div className="mt-2 space-y-1">
                        {order.itens?.map((item: any, idx: number) => (
                          <p key={idx} className="text-xs text-stone-600">{item.quantidade}x {item.nome}</p>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-stone-800">R$ {order.valor_total?.toFixed(2)}</p>
                      <span className="text-[10px] font-bold uppercase text-stone-400">{order.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Excluir Usuário */}
      {deletingUserId && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-6 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">Excluir Usuário</h3>
            <p className="text-stone-500 mb-6">Tem certeza que deseja excluir permanentemente este usuário da base de dados e do Google Auth? Esta ação é irreversível.</p>
            <div className="flex gap-3">
              <button 
                onClick={handleDeleteUser}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all"
                disabled={saveLoading}
              >
                {saveLoading ? 'Excluindo...' : 'Excluir'}
              </button>
              <button 
                onClick={() => setDeletingUserId(null)}
                className="flex-1 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-all"
                disabled={saveLoading}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Usuário */}
      {editingUser && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-stone-800">Editar Usuário</h3>
              <button onClick={() => setEditingUser(null)} className="p-2 hover:bg-stone-100 rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Nome</label>
                <input 
                  type="text"
                  value={editingUser.nome}
                  onChange={e => setEditingUser({...editingUser, nome: e.target.value})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Email</label>
                <input 
                  type="email"
                  value={editingUser.email}
                  onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Telefone</label>
                <input 
                  type="text"
                  value={editingUser.telefone}
                  onChange={e => setEditingUser({...editingUser, telefone: e.target.value})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="submit"
                  disabled={saveLoading}
                  className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                >
                  {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  Salvar Alterações
                </button>
                <button 
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="flex-1 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão */}
      {deletingUserId && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-6 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">Confirmar Exclusão</h3>
            <p className="text-stone-500 mb-6 font-bold text-red-600 uppercase text-xs">Atenção: Esta ação é irreversível!</p>
            <p className="text-stone-500 mb-6">Tem certeza que deseja EXCLUIR este usuário permanentemente do sistema e do Firebase Authentication?</p>
            <div className="flex gap-3">
              <button 
                onClick={handleDeleteUser}
                disabled={saveLoading}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all flex items-center justify-center gap-2"
              >
                {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Excluir'}
              </button>
              <button 
                onClick={() => setDeletingUserId(null)}
                className="flex-1 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LocationManagement() {
  const [estados, setEstados] = useState<any[]>([]);
  const [cidades, setCidades] = useState<any[]>([]);
  const [bairros, setBairros] = useState<any[]>([]);

  const [selectedEstado, setSelectedEstado] = useState<string>('');
  const [selectedCidade, setSelectedCidade] = useState<string>('');

  const [newEstado, setNewEstado] = useState({ nome: '', sigla: '', ativo: true });
  const [newCidade, setNewCidade] = useState({ nome: '', ativo: true });
  const [newBairro, setNewBairro] = useState({ nome: '', ativo: true });

  const [editingItem, setEditingItem] = useState<{ id: string, nome: string, sigla?: string, collection: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ id: string, collection: string } | null>(null);

  const fetchEstados = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'estados'));
      setEstados(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'estados');
    }
  }, []);

  useEffect(() => {
    fetchEstados();
  }, [fetchEstados]);

  const fetchCidades = useCallback(async () => {
    if (!selectedEstado) {
      setCidades([]);
      return;
    }
    try {
      const q = query(collection(db, 'cidades'), where('estado_id', '==', selectedEstado));
      const snap = await getDocs(q);
      setCidades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'cidades');
    }
  }, [selectedEstado]);

  useEffect(() => {
    fetchCidades();
  }, [fetchCidades]);

  const fetchBairros = useCallback(async () => {
    if (!selectedCidade) {
      setBairros([]);
      return;
    }
    try {
      const q = query(collection(db, 'bairros'), where('cidade_id', '==', selectedCidade));
      const snap = await getDocs(q);
      setBairros(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'bairros');
    }
  }, [selectedCidade]);

  useEffect(() => {
    fetchBairros();
  }, [fetchBairros]);

  const handleRefresh = () => {
    fetchEstados();
    if (selectedEstado) fetchCidades();
    if (selectedCidade) fetchBairros();
  };

  const handleAddEstado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEstado.nome || !newEstado.sigla) return;
    try {
      await addDoc(collection(db, 'estados'), {
        ...newEstado,
        sigla: newEstado.sigla.toUpperCase(),
        data_criacao: new Date().toISOString()
      });
      setNewEstado({ nome: '', sigla: '', ativo: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'estados');
    }
  };

  const handleAddCidade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCidade.nome || !selectedEstado) return;
    try {
      await addDoc(collection(db, 'cidades'), {
        ...newCidade,
        estado_id: selectedEstado,
        data_criacao: new Date().toISOString()
      });
      setNewCidade({ nome: '', ativo: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'cidades');
    }
  };

  const handleAddBairro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBairro.nome || !selectedCidade) return;
    try {
      await addDoc(collection(db, 'bairros'), {
        ...newBairro,
        cidade_id: selectedCidade,
        data_criacao: new Date().toISOString()
      });
      setNewBairro({ nome: '', ativo: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bairros');
    }
  };

  const handleToggleAtivo = async (id: string, current: boolean, collectionName: string) => {
    try {
      await updateDoc(doc(db, collectionName, id), { ativo: !current });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${id}`);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    try {
      await deleteDoc(doc(db, deletingItem.collection, deletingItem.id));
      setDeletingItem(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${deletingItem.collection}/${deletingItem.id}`);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.nome) return;
    try {
      const updates: any = { nome: editingItem.nome };
      if (editingItem.sigla) updates.sigla = editingItem.sigla.toUpperCase();
      
      await updateDoc(doc(db, editingItem.collection, editingItem.id), updates);
      setEditingItem(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${editingItem.collection}/${editingItem.id}`);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-stone-800">Gerenciar Localidades</h2>
        <button 
          onClick={handleRefresh}
          className="p-2 bg-white border border-stone-200 text-stone-600 rounded-xl hover:bg-stone-50 transition-all shadow-sm"
          title="Atualizar localidades"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Estados */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col h-full">
          <h3 className="text-lg font-bold text-stone-800 mb-4">1. Estados</h3>
          <form onSubmit={handleAddEstado} className="flex flex-col gap-3 mb-6">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Nome</label>
                <input 
                  value={newEstado.nome}
                  onChange={e => setNewEstado({...newEstado, nome: e.target.value})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="Ex: São Paulo"
                  required
                />
              </div>
              <div className="w-20 space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Sigla</label>
                <input 
                  value={newEstado.sigla}
                  onChange={e => setNewEstado({...newEstado, sigla: e.target.value})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 uppercase"
                  placeholder="SP"
                  maxLength={2}
                  required
                />
              </div>
            </div>
            <button type="submit" className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 font-bold">
              <Plus className="w-5 h-5" /> Adicionar Estado
            </button>
          </form>

          <div className="flex-1 overflow-y-auto max-h-[500px] space-y-2 pr-2 custom-scrollbar">
            {estados.map(e => (
              <div 
                key={e.id} 
                onClick={() => {
                  setSelectedEstado(e.id);
                  setSelectedCidade('');
                }}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between group ${selectedEstado === e.id ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 hover:border-emerald-300'}`}
              >
                <div>
                  <p className="font-bold text-stone-800">{e.nome}</p>
                  <p className="text-xs text-stone-500">{e.sigla}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={(ev) => { ev.stopPropagation(); setEditingItem({ id: e.id, nome: e.nome, sigla: e.sigla, collection: 'estados' }); }}
                    className="p-2 text-stone-300 hover:text-blue-500 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={(ev) => { ev.stopPropagation(); handleToggleAtivo(e.id, e.ativo, 'estados'); }}
                    className={`p-2 rounded-lg transition-all ${e.ativo ? 'text-emerald-500 hover:bg-emerald-100' : 'text-stone-300 hover:bg-stone-100'}`}
                  >
                    {e.ativo ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  </button>
                  <button onClick={(ev) => { ev.stopPropagation(); setDeletingItem({ id: e.id, collection: 'estados' }); }} className="p-2 text-stone-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {estados.length === 0 && (
              <p className="text-stone-400 text-sm text-center py-4">Nenhum estado cadastrado.</p>
            )}
          </div>
        </div>

        {/* Cidades */}
        <div className={`bg-white p-6 rounded-3xl border shadow-sm flex flex-col h-full transition-all ${!selectedEstado ? 'border-stone-100 opacity-60' : 'border-stone-200'}`}>
          <h3 className="text-lg font-bold text-stone-800 mb-4">
            2. Cidades {selectedEstado && <span className="text-emerald-600 text-sm font-normal ml-2">({estados.find(e => e.id === selectedEstado)?.sigla})</span>}
          </h3>
          
          {!selectedEstado ? (
            <div className="flex-1 flex items-center justify-center text-center p-6">
              <p className="text-stone-400 font-medium">Selecione um estado ao lado para gerenciar suas cidades.</p>
            </div>
          ) : (
            <>
              <form onSubmit={handleAddCidade} className="flex flex-col gap-3 mb-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase">Nome da Cidade</label>
                  <input 
                    value={newCidade.nome}
                    onChange={e => setNewCidade({...newCidade, nome: e.target.value})}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Ex: Campinas"
                    required
                  />
                </div>
                <button type="submit" className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 font-bold">
                  <Plus className="w-5 h-5" /> Adicionar Cidade
                </button>
              </form>

              <div className="flex-1 overflow-y-auto max-h-[500px] space-y-2 pr-2 custom-scrollbar">
                {cidades.map(c => (
                  <div 
                    key={c.id} 
                    onClick={() => setSelectedCidade(c.id)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between group ${selectedCidade === c.id ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 hover:border-emerald-300'}`}
                  >
                    <p className="font-bold text-stone-800">{c.nome}</p>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={(ev) => { ev.stopPropagation(); setEditingItem({ id: c.id, nome: c.nome, collection: 'cidades' }); }}
                        className="p-2 text-stone-300 hover:text-blue-500 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(ev) => { ev.stopPropagation(); handleToggleAtivo(c.id, c.ativo, 'cidades'); }}
                        className={`p-2 rounded-lg transition-all ${c.ativo ? 'text-emerald-500 hover:bg-emerald-100' : 'text-stone-300 hover:bg-stone-100'}`}
                      >
                        {c.ativo ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </button>
                      <button onClick={(ev) => { ev.stopPropagation(); setDeletingItem({ id: c.id, collection: 'cidades' }); }} className="p-2 text-stone-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {cidades.length === 0 && (
                  <p className="text-stone-400 text-sm text-center py-4">Nenhuma cidade cadastrada neste estado.</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Bairros */}
        <div className={`bg-white p-6 rounded-3xl border shadow-sm flex flex-col h-full transition-all ${!selectedCidade ? 'border-stone-100 opacity-60' : 'border-stone-200'}`}>
          <h3 className="text-lg font-bold text-stone-800 mb-4">
            3. Bairros {selectedCidade && <span className="text-emerald-600 text-sm font-normal ml-2">({cidades.find(c => c.id === selectedCidade)?.nome})</span>}
          </h3>
          
          {!selectedCidade ? (
            <div className="flex-1 flex items-center justify-center text-center p-6">
              <p className="text-stone-400 font-medium">Selecione uma cidade ao lado para gerenciar seus bairros.</p>
            </div>
          ) : (
            <>
              <form onSubmit={handleAddBairro} className="flex flex-col gap-3 mb-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase">Nome do Bairro</label>
                  <input 
                    value={newBairro.nome}
                    onChange={e => setNewBairro({...newBairro, nome: e.target.value})}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Ex: Centro"
                    required
                  />
                </div>
                <button type="submit" className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 font-bold">
                  <Plus className="w-5 h-5" /> Adicionar Bairro
                </button>
              </form>

              <div className="flex-1 overflow-y-auto max-h-[500px] space-y-2 pr-2 custom-scrollbar">
                {bairros.map(b => (
                  <div key={b.id} className="p-4 rounded-2xl border border-stone-200 flex items-center justify-between group hover:border-emerald-300 transition-all">
                    <p className="font-bold text-stone-800">{b.nome}</p>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => setEditingItem({ id: b.id, nome: b.nome, collection: 'bairros' })}
                        className="p-2 text-stone-300 hover:text-blue-500 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleToggleAtivo(b.id, b.ativo, 'bairros')}
                        className={`p-2 rounded-lg transition-all ${b.ativo ? 'text-emerald-500 hover:bg-emerald-100' : 'text-stone-300 hover:bg-stone-100'}`}
                      >
                        {b.ativo ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setDeletingItem({ id: b.id, collection: 'bairros' })} className="p-2 text-stone-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {bairros.length === 0 && (
                  <p className="text-stone-400 text-sm text-center py-4">Nenhum bairro cadastrado nesta cidade.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {editingItem && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
              <h3 className="text-xl font-bold text-stone-800">Editar {editingItem.collection === 'estados' ? 'Estado' : editingItem.collection === 'cidades' ? 'Cidade' : 'Bairro'}</h3>
              <button onClick={() => setEditingItem(null)} className="p-2 hover:bg-stone-200 rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleUpdate} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Nome</label>
                <input 
                  value={editingItem.nome}
                  onChange={e => setEditingItem({...editingItem, nome: e.target.value})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                  required
                />
              </div>
              {editingItem.collection === 'estados' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase">Sigla</label>
                  <input 
                    value={editingItem.sigla}
                    onChange={e => setEditingItem({...editingItem, sigla: e.target.value.toUpperCase()})}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 uppercase"
                    maxLength={2}
                    required
                  />
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all">
                  Salvar Alterações
                </button>
                <button type="button" onClick={() => setEditingItem(null)} className="px-6 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-all">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingItem && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-6 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">Confirmar Exclusão</h3>
            <p className="text-stone-500 mb-6">Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button 
                onClick={handleDelete}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all"
              >
                Excluir
              </button>
              <button 
                onClick={() => setDeletingItem(null)}
                className="flex-1 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CouponManagement({ restaurants, categories, products }: { restaurants: any[], categories: any[], products: any[] }) {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [newCoupon, setNewCoupon] = useState({ 
    codigo: '', 
    valor: '', 
    tipo: 'fixo',
    valor_minimo: '',
    limite_total: '',
    limite_por_usuario: '',
    data_inicio: '',
    data_fim: '',
    restaurante_id: '',
    tipo_escopo: 'geral', // geral, restaurante, categoria, produto
    escopo_id: ''
  });
  const [selectedCoupon, setSelectedCoupon] = useState<any>(null);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null);

  const fetchCoupons = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'coupons'), limit(50)));
      setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'coupons');
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const snap = await getDocs(query(collectionGroup(db, 'orders'), orderBy('data_criacao', 'desc'), limit(50)));
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'orders');
    }
  }, []);

  useEffect(() => {
    fetchCoupons();
    fetchOrders();
  }, [fetchCoupons, fetchOrders]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const couponData: any = {
        ...newCoupon,
        valor: parseFloat(newCoupon.valor),
        valor_minimo: parseFloat(newCoupon.valor_minimo) || 0,
        limite_total: parseInt(newCoupon.limite_total) || 0,
        limite_por_usuario: parseInt(newCoupon.limite_por_usuario) || 1,
        ativo: true,
      };

      if (editingCouponId) {
        await updateDoc(doc(db, 'coupons', editingCouponId), {
          ...couponData,
          data_atualizacao: new Date().toISOString()
        });
        setEditingCouponId(null);
      } else {
        await addDoc(collection(db, 'coupons'), {
          ...couponData,
          usos: 0,
          data_criacao: new Date().toISOString()
        });
      }

      setNewCoupon({ 
        codigo: '', 
        valor: '', 
        tipo: 'fixo',
        valor_minimo: '',
        limite_total: '',
        limite_por_usuario: '',
        data_inicio: '',
        data_fim: '',
        restaurante_id: '',
        tipo_escopo: 'geral',
        escopo_id: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, editingCouponId ? `coupons/${editingCouponId}` : 'coupons');
    }
  };

  const handleEdit = (coupon: any) => {
    setEditingCouponId(coupon.id);
    setNewCoupon({
      codigo: coupon.codigo,
      valor: coupon.valor.toString(),
      tipo: coupon.tipo,
      valor_minimo: coupon.valor_minimo?.toString() || '',
      limite_total: coupon.limite_total?.toString() || '',
      limite_por_usuario: coupon.limite_por_usuario?.toString() || '',
      data_inicio: coupon.data_inicio || '',
      data_fim: coupon.data_fim || '',
      restaurante_id: coupon.restaurante_id || '',
      tipo_escopo: coupon.tipo_escopo || 'geral',
      escopo_id: coupon.escopo_id || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingCouponId(null);
    setNewCoupon({ 
      codigo: '', 
      valor: '', 
      tipo: 'fixo',
      valor_minimo: '',
      limite_total: '',
      limite_por_usuario: '',
      data_inicio: '',
      data_fim: '',
      restaurante_id: '',
      tipo_escopo: 'geral',
      escopo_id: ''
    });
  };

  const getCouponStats = (codigo: string) => {
    const couponOrders = orders.filter(o => o.cupom_codigo === codigo);
    const totalDesconto = couponOrders.reduce((acc, o) => acc + (o.valor_desconto || 0), 0);
    const uniqueUsers = new Set(couponOrders.map(o => o.usuario_id)).size;
    return {
      totalUsos: couponOrders.length,
      totalUsuarios: uniqueUsers,
      totalDesconto
    };
  };

  const handleDelete = async () => {
    if (!deletingCouponId) return;
    try {
      await deleteDoc(doc(db, 'coupons', deletingCouponId));
      setDeletingCouponId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `coupons/${deletingCouponId}`);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-stone-800">{editingCouponId ? 'Editar Cupom' : 'Gerenciar Cupons'}</h2>
      <form onSubmit={handleAdd} className="bg-white p-6 rounded-3xl border border-stone-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Código</label>
          <input 
            value={newCoupon.codigo}
            onChange={e => setNewCoupon({...newCoupon, codigo: e.target.value.toUpperCase()})}
            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
            placeholder="EX: BEMVINDO"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Valor Desconto</label>
          <input 
            type="number"
            step="0.01"
            value={newCoupon.valor}
            onChange={e => setNewCoupon({...newCoupon, valor: e.target.value})}
            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
            placeholder="10"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Tipo</label>
          <select 
            value={newCoupon.tipo}
            onChange={e => setNewCoupon({...newCoupon, tipo: e.target.value})}
            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
          >
            <option value="fixo">R$ Fixo</option>
            <option value="porcentagem">% Porcentagem</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Valor Mínimo Pedido</label>
          <input 
            type="number"
            step="0.01"
            value={newCoupon.valor_minimo}
            onChange={e => setNewCoupon({...newCoupon, valor_minimo: e.target.value})}
            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
            placeholder="50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Limite Total</label>
          <input 
            type="number"
            value={newCoupon.limite_total}
            onChange={e => setNewCoupon({...newCoupon, limite_total: e.target.value})}
            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
            placeholder="100"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Limite por Usuário</label>
          <input 
            type="number"
            value={newCoupon.limite_por_usuario}
            onChange={e => setNewCoupon({...newCoupon, limite_por_usuario: e.target.value})}
            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
            placeholder="1"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Escopo do Cupom</label>
          <select 
            value={newCoupon.tipo_escopo}
            onChange={e => setNewCoupon({...newCoupon, tipo_escopo: e.target.value, escopo_id: ''})}
            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
          >
            <option value="geral">Todos os Restaurantes</option>
            <option value="restaurante">Restaurante Específico</option>
            <option value="categoria">Categoria Específica</option>
            <option value="produto">Produto Específico</option>
          </select>
        </div>

        {newCoupon.tipo_escopo !== 'geral' && (
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase">
              {newCoupon.tipo_escopo === 'restaurante' ? 'Selecionar Restaurante' : 
               newCoupon.tipo_escopo === 'categoria' ? 'Selecionar Categoria' : 
               'Selecionar Produto'}
            </label>
            <select 
              value={newCoupon.escopo_id}
              onChange={e => setNewCoupon({...newCoupon, escopo_id: e.target.value})}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
              required
            >
              <option value="">Selecione...</option>
              {newCoupon.tipo_escopo === 'restaurante' && restaurants.map(r => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
              {newCoupon.tipo_escopo === 'categoria' && categories.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
              {newCoupon.tipo_escopo === 'produto' && products.map(p => {
                const restaurant = restaurants.find(r => r.id === p.restaurante_id);
                return (
                  <option key={p.id} value={p.id}>
                    {restaurant ? `${restaurant.nome} - ` : ''}{p.nome}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Data Início</label>
          <input 
            type="date"
            value={newCoupon.data_inicio}
            onChange={e => setNewCoupon({...newCoupon, data_inicio: e.target.value})}
            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Data Fim</label>
          <input 
            type="date"
            value={newCoupon.data_fim}
            onChange={e => setNewCoupon({...newCoupon, data_fim: e.target.value})}
            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
          />
        </div>
        <div className="lg:col-span-4 flex gap-3">
          <button type="submit" className="flex-1 bg-emerald-600 text-white p-3 rounded-xl font-bold hover:bg-emerald-700 transition-all">
            {editingCouponId ? 'Salvar Alterações' : 'Criar Cupom'}
          </button>
          {editingCouponId && (
            <button 
              type="button" 
              onClick={handleCancelEdit}
              className="px-8 bg-stone-100 text-stone-600 p-3 rounded-xl font-bold hover:bg-stone-200 transition-all"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {coupons.map(c => (
          <div 
            key={c.id} 
            onClick={() => setSelectedCoupon(c)}
            className="bg-white p-6 rounded-3xl border border-stone-200 flex items-center justify-between shadow-sm hover:shadow-md transition-all cursor-pointer group"
          >
            <div>
              <p className="text-xl font-black text-emerald-600 tracking-tighter">{c.codigo}</p>
              <p className="text-sm font-bold text-stone-500">
                {c.tipo === 'fixo' ? `R$ ${c.valor.toFixed(2)}` : `${c.valor}%`} de desconto
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(c);
                }} 
                className="p-2 text-stone-300 hover:text-blue-500 transition-all opacity-0 group-hover:opacity-100"
              >
                <Edit3 className="w-5 h-5" />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingCouponId(c.id);
                }} 
                className="p-2 text-stone-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <Eye className="w-5 h-5 text-stone-300 group-hover:text-emerald-500 transition-all" />
            </div>
          </div>
        ))}
      </div>

      {selectedCoupon && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
              <h3 className="text-xl font-bold text-stone-800">Estatísticas do Cupom: {selectedCoupon.codigo}</h3>
              <button onClick={() => setSelectedCoupon(null)} className="p-2 hover:bg-stone-200 rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              {(() => {
                const stats = getCouponStats(selectedCoupon.codigo);
                return (
                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-6 bg-emerald-50 rounded-2xl">
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Total de Usos</p>
                      <p className="text-3xl font-black text-emerald-700 mt-1">{stats.totalUsos}</p>
                    </div>
                    <div className="p-6 bg-blue-50 rounded-2xl">
                      <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Usuários Únicos</p>
                      <p className="text-3xl font-black text-blue-700 mt-1">{stats.totalUsuarios}</p>
                    </div>
                    <div className="p-6 bg-purple-50 rounded-2xl">
                      <p className="text-xs font-bold text-purple-600 uppercase tracking-widest">Total Descontos Aplicados</p>
                      <p className="text-3xl font-black text-purple-700 mt-1">R$ {stats.totalDesconto.toFixed(2)}</p>
                    </div>
                  </div>
                );
              })()}
              
              <div className="space-y-2 pt-4 border-t border-stone-100">
                <p className="text-xs font-bold text-stone-400 uppercase">Configurações</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-stone-500">Mínimo:</span>
                    <span className="ml-2 font-bold text-stone-800">R$ {selectedCoupon.valor_minimo?.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-stone-500">Limite Usuário:</span>
                    <span className="ml-2 font-bold text-stone-800">{selectedCoupon.limite_por_usuario}</span>
                  </div>
                  <div>
                    <span className="text-stone-500">Início:</span>
                    <span className="ml-2 font-bold text-stone-800">{selectedCoupon.data_inicio || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-stone-500">Fim:</span>
                    <span className="ml-2 font-bold text-stone-800">{selectedCoupon.data_fim || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {deletingCouponId && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-6 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">Confirmar Exclusão</h3>
            <p className="text-stone-500 mb-6">Tem certeza que deseja excluir este cupom? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button 
                onClick={handleDelete}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all"
              >
                Excluir
              </button>
              <button 
                onClick={() => setDeletingCouponId(null)}
                className="flex-1 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BannerManagement() {
  const [banners, setBanners] = useState<any[]>([]);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [deletingBannerId, setDeletingBannerId] = useState<string | null>(null);
  const [newBanner, setNewBanner] = useState({ 
    titulo: '', 
    bannerUrl: '', 
    link: '',
    data_inicio_exibicao: '',
    data_fim_exibicao: '',
    ativo: true
  });

  const fetchData = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'banners'), limit(50)));
      setBanners(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'banners');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBanner.bannerUrl) {
      alert('Por favor, faça upload de uma imagem.');
      return;
    }
    try {
      if (editingBannerId) {
        await updateDoc(doc(db, 'banners', editingBannerId), {
          ...newBanner
        });
        setEditingBannerId(null);
      } else {
        await addDoc(collection(db, 'banners'), {
          ...newBanner,
          data_criacao: new Date().toISOString()
        });
      }
      setNewBanner({ 
        titulo: '', 
        bannerUrl: '', 
        link: '',
        data_inicio_exibicao: '',
        data_fim_exibicao: '',
        ativo: true
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, editingBannerId ? `banners/${editingBannerId}` : 'banners');
    }
  };

  const handleEdit = (banner: any) => {
    setEditingBannerId(banner.id);
    setNewBanner({
      titulo: banner.titulo || '',
      bannerUrl: banner.bannerUrl || banner.image_url || '',
      link: banner.link || '',
      data_inicio_exibicao: banner.data_inicio_exibicao || '',
      data_fim_exibicao: banner.data_fim_exibicao || '',
      ativo: banner.ativo ?? true
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingBannerId(null);
    setNewBanner({ 
      titulo: '', 
      bannerUrl: '', 
      link: '',
      data_inicio_exibicao: '',
      data_fim_exibicao: '',
      ativo: true
    });
  };

  const handleToggleAtivo = async (id: string, current: boolean) => {
    try {
      await updateDoc(doc(db, 'banners', id), { ativo: !current });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `banners/${id}`);
    }
  };

  const handleDelete = async () => {
    if (!deletingBannerId) return;
    try {
      await deleteDoc(doc(db, 'banners', deletingBannerId));
      setDeletingBannerId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `banners/${deletingBannerId}`);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-stone-800">
        {editingBannerId ? 'Editar Banner' : 'Gerenciar Banners'}
      </h2>
      <form onSubmit={handleAdd} className="bg-white p-6 rounded-3xl border border-stone-200 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase">Título do Banner</label>
            <input 
              value={newBanner.titulo}
              onChange={e => setNewBanner({...newBanner, titulo: e.target.value})}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
              placeholder="Ex: Promoção de Verão"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase">Link de Redirecionamento</label>
            <input 
              value={newBanner.link}
              onChange={e => setNewBanner({...newBanner, link: e.target.value})}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
              placeholder="Link do restaurante, produto ou externo"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase">Data Início Exibição</label>
            <input 
              type="date"
              value={newBanner.data_inicio_exibicao}
              onChange={e => setNewBanner({...newBanner, data_inicio_exibicao: e.target.value})}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase">Data Fim Exibição</label>
            <input 
              type="date"
              value={newBanner.data_fim_exibicao}
              onChange={e => setNewBanner({...newBanner, data_fim_exibicao: e.target.value})}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <ImageUpload 
              label="Imagem do Banner"
              path="restaurants/banners"
              aspectRatio="banner"
              isBanner={true}
              currentImageUrl={newBanner.bannerUrl}
              onUploadComplete={(url) => setNewBanner({...newBanner, bannerUrl: url})}
            />
          </div>
        </div>
        <div className="flex gap-4">
          <button 
            type="submit" 
            className="flex-1 bg-emerald-600 text-white p-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all"
          >
            {editingBannerId ? 'Salvar Alterações' : 'Adicionar Banner'}
          </button>
          {editingBannerId && (
            <button 
              type="button"
              onClick={handleCancelEdit}
              className="px-8 bg-stone-100 text-stone-600 p-4 rounded-2xl font-bold hover:bg-stone-200 transition-all"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {banners.map(b => (
          <div key={b.id} className="bg-white rounded-3xl border border-stone-200 overflow-hidden group relative shadow-sm">
            <img src={b.bannerUrl || b.image_url || 'https://picsum.photos/seed/banner/600/400'} className="w-full h-48 object-cover" referrerPolicy="no-referrer" loading="lazy" />
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="font-bold text-stone-800">{b.titulo}</p>
                <p className="text-[10px] text-stone-400 uppercase font-bold tracking-wider">
                  {b.data_inicio_exibicao} até {b.data_fim_exibicao}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleEdit(b)}
                  className="p-2 text-stone-300 hover:text-emerald-500 transition-all"
                  title="Editar"
                >
                  <Edit className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => handleToggleAtivo(b.id, b.ativo)}
                  className={`p-2 rounded-lg transition-all ${b.ativo ? 'text-emerald-500 hover:bg-emerald-50' : 'text-stone-300 hover:bg-stone-50'}`}
                >
                  {b.ativo ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                </button>
                <button onClick={() => setDeletingBannerId(b.id)} className="p-2 text-stone-300 hover:text-red-500 transition-all">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {deletingBannerId && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-6 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">Confirmar Exclusão</h3>
            <p className="text-stone-500 mb-6">Tem certeza que deseja excluir este banner? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button 
                onClick={handleDelete}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all"
              >
                Excluir
              </button>
              <button 
                onClick={() => setDeletingBannerId(null)}
                className="flex-1 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryManagement() {
  const [categories, setCategories] = useState<any[]>([]);
  const [newCat, setNewCat] = useState({ nome: '', icon_url: '' });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 100;
          canvas.height = 100;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }
          ctx.drawImage(img, 0, 0, 100, 100);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob failed'));
          }, 'image/webp', 0.8);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const processedBlob = await processImage(file);
      const storageRef = ref(storage, `categories/${Date.now()}.webp`);
      await uploadBytes(storageRef, processedBlob);
      const downloadURL = await getDownloadURL(storageRef);
      setNewCat({ ...newCat, icon_url: downloadURL });
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Erro ao processar ou enviar imagem.');
    } finally {
      setUploading(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'categories'), limit(50)));
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'categories');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCategoryId) {
        await updateDoc(doc(db, 'categories', editingCategoryId), {
          ...newCat,
          data_atualizacao: new Date().toISOString()
        });
        setEditingCategoryId(null);
      } else {
        await addDoc(collection(db, 'categories'), {
          ...newCat,
          data_criacao: new Date().toISOString()
        });
      }
      setNewCat({ nome: '', icon_url: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, editingCategoryId ? `categories/${editingCategoryId}` : 'categories');
    }
  };

  const handleEdit = (category: any) => {
    setEditingCategoryId(category.id);
    setNewCat({
      nome: category.nome || '',
      icon_url: category.icon_url || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingCategoryId(null);
    setNewCat({ nome: '', icon_url: '' });
  };

  const handleDelete = async () => {
    if (!deletingCategoryId) return;
    try {
      await deleteDoc(doc(db, 'categories', deletingCategoryId));
      setDeletingCategoryId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${deletingCategoryId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-stone-800">{editingCategoryId ? 'Editar Categoria' : 'Gerenciar Categorias'}</h2>
        <button 
          onClick={fetchData}
          className="p-2 bg-white border border-stone-200 text-stone-600 rounded-xl hover:bg-stone-50 transition-all shadow-sm"
          title="Atualizar categorias"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>
      <form onSubmit={handleAdd} className="bg-white p-6 rounded-3xl border border-stone-200 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Nome</label>
          <input 
            value={newCat.nome}
            onChange={e => setNewCat({...newCat, nome: e.target.value})}
            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
            placeholder="Ex: Pizza"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Ícone da Categoria</label>
          <div className="flex items-center gap-3">
            {newCat.icon_url ? (
              <div className="relative w-12 h-12 rounded-xl border border-stone-200 overflow-hidden bg-stone-50">
                <img src={newCat.icon_url} className="w-full h-full object-contain" />
                <button 
                  type="button"
                  onClick={() => setNewCat({ ...newCat, icon_url: '' })}
                  className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-12 h-12 rounded-xl border-2 border-dashed border-stone-200 flex items-center justify-center text-stone-400 hover:border-emerald-500 hover:text-emerald-500 transition-all"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              </button>
            )}
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />
            <span className="text-xs text-stone-500">
              {uploading ? 'Enviando...' : (newCat.icon_url ? 'Imagem pronta' : 'Selecione uma imagem')}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <button type="submit" className="flex-1 bg-emerald-600 text-white p-3 rounded-xl font-bold hover:bg-emerald-700 transition-all">
            {editingCategoryId ? 'Salvar Alterações' : 'Adicionar Categoria'}
          </button>
          {editingCategoryId && (
            <button 
              type="button" 
              onClick={handleCancelEdit}
              className="px-6 bg-stone-100 text-stone-600 p-3 rounded-xl font-bold hover:bg-stone-200 transition-all"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        {categories.map(c => (
          <div key={c.id} className="bg-white p-4 rounded-2xl border border-stone-200 flex flex-col items-center gap-2 group relative">
            <img src={c.icon_url || 'https://picsum.photos/seed/icon/100/100'} className="w-12 h-12 object-contain" referrerPolicy="no-referrer" loading="lazy" />
            <span className="text-xs font-bold text-stone-800">{c.nome}</span>
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
              <button 
                onClick={() => handleEdit(c)} 
                className="p-1 text-stone-300 hover:text-blue-500 transition-all"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setDeletingCategoryId(c.id)} 
                className="p-1 text-stone-300 hover:text-red-500 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {deletingCategoryId && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-6 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">Confirmar Exclusão</h3>
            <p className="text-stone-500 mb-6">Tem certeza que deseja excluir esta categoria? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button 
                onClick={handleDelete}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all"
              >
                Excluir
              </button>
              <button 
                onClick={() => setDeletingCategoryId(null)}
                className="flex-1 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportManagement({ users, restaurants, orders }: any) {
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const formatDate = (dateValue: any) => {
    if (!dateValue) return 'Data indisponível';
    try {
      if (typeof dateValue.toDate === 'function') return dateValue.toDate().toLocaleString();
      return new Date(dateValue).toLocaleString();
    } catch (e) {
      return 'Data inválida';
    }
  };

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      try {
        const reportsData = await getReports();
        setReports(reportsData);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'reports');
      } finally {
        setLoading(false);
      }
    };
    
    fetchReports();
  }, []);

  const filteredReports = useMemo(() => {
    if (statusFilter === 'all') return reports;
    return reports.filter(r => r.status === statusFilter);
  }, [reports, statusFilter]);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'reports', id), { 
        status: newStatus,
        data_atualizacao: new Date().toISOString()
      });
      if (selectedReport && selectedReport.id === id) {
        setSelectedReport({ ...selectedReport, status: newStatus, data_atualizacao: new Date().toISOString() });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `reports/${id}`);
    }
  };

  if (loading) return <div className="p-12 text-center text-stone-500">Carregando denúncias...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-stone-800">Gerenciar Denúncias</h2>
        <select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          className="p-2 border border-stone-200 rounded-xl font-bold text-sm"
        >
          <option value="all">Todas</option>
          <option value="pendente">Pendente</option>
          <option value="em_analise">Em Análise</option>
          <option value="resolvida">Resolvida</option>
        </select>
      </div>

      {filteredReports.length === 0 ? (
        <div className="p-12 bg-white rounded-3xl border border-stone-200 text-center text-stone-400">
          Nenhuma denúncia encontrada.
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200 overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="p-4 font-bold text-stone-600">Assunto / Pedido</th>
                <th className="p-4 font-bold text-stone-600">Status</th>
                <th className="p-4 font-bold text-stone-600">Data</th>
                <th className="p-4 font-bold text-stone-600">Envolvidos</th>
                <th className="p-4 font-bold text-stone-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map(r => {
                const order = orders.find((o: any) => o.id === r.orderId);
                const client = users.find((c: any) => c.id === r.reporterId) || users.find((c: any) => c.id === r.clientId);
                const restaurant = restaurants.find((res: any) => res.id === r.restaurantId) || restaurants.find((res: any) => res.id === r.reportedId);
                
                const isOrderLoading = !order && orders.length === 0;
                const isClientLoading = !client && users.length === 0;
                const isRestaurantLoading = !restaurant && restaurants.length === 0;

                return (
                  <tr key={r.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="p-4 font-bold text-stone-800">
                      <p>{typeof r.message === 'string' ? r.message.substring(0, 40) : 'Sem mensagem'}{r.message?.length > 40 ? '...' : ''}</p>
                      <div className="text-xs text-stone-500 font-normal mt-1">
                        {isOrderLoading ? 'Carregando pedido...' : order ? (
                          <span>Pedido: #{String(order.id || '').slice(-5).toUpperCase()} - R$ {Number(order.total || 0).toFixed(2)} ({order.items?.length || 0} itens)</span>
                        ) : 'Pedido não encontrado'}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                        r.status === 'resolvida' ? 'bg-emerald-100 text-emerald-600' : 
                        r.status === 'em_analise' ? 'bg-blue-100 text-blue-600' : 
                        'bg-orange-100 text-orange-600'
                      }`}>
                        {r.status || 'pendente'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-stone-500">{formatDate(r.createdAt)}</td>
                    <td className="p-4 text-sm">
                      <p className="font-bold text-stone-800">C: {isClientLoading ? 'Carregando...' : client?.nome || 'N/A'}</p>
                      <p className="text-stone-500">R: {isRestaurantLoading ? 'Carregando...' : restaurant?.nome || 'N/A'}</p>
                    </td>
                    <td className="p-4">
                      <button onClick={() => setSelectedReport(r)} className="text-emerald-600 font-bold text-sm hover:underline">Ver detalhes</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedReport && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
              <h3 className="text-xl font-bold text-stone-800">Detalhes da Denúncia</h3>
              <button onClick={() => setSelectedReport(null)} className="p-2 hover:bg-stone-200 rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              
              <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100">
                <p className="text-sm font-bold text-orange-800 mb-1">Motivo / Mensagem</p>
                <p className="text-sm text-orange-900">{selectedReport.message || 'Nenhuma mensagem fornecida.'}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div className="space-y-4">
                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                    <p className="font-bold text-stone-800 mb-2 flex items-center gap-2">
                      Denunciante (Cliente)
                    </p>
                    {(() => {
                      const client = users.find((u: any) => u.id === selectedReport.reporterId) || users.find((u: any) => u.id === selectedReport.clientId);
                      if (!client && users.length === 0) return <p className="text-stone-500">Carregando dados do cliente...</p>;
                      if (!client) return <p className="text-stone-500">Cliente não encontrado.</p>;
                      return (
                        <>
                          <p className="font-bold">{client.nome}</p>
                          <p className="text-stone-500">{client.email}</p>
                          {client.telefone && (
                            <a href={`https://wa.me/${String(client.telefone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-emerald-600 font-bold hover:underline mt-1 inline-block">
                              WhatsApp: {client.telefone}
                            </a>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                    <p className="font-bold text-stone-800 mb-2 flex items-center gap-2">
                      Denunciado (Restaurante)
                    </p>
                    {(() => {
                      const restaurant = restaurants.find((r: any) => r.id === selectedReport.restaurantId) || restaurants.find((r: any) => r.id === selectedReport.reportedId);
                      if (!restaurant && restaurants.length === 0) return <p className="text-stone-500">Carregando dados do restaurante...</p>;
                      if (!restaurant) return <p className="text-stone-500">Restaurante não encontrado.</p>;
                      return (
                        <>
                          <p className="font-bold">{restaurant.nome}</p>
                          <p className="text-stone-500">{restaurant.email}</p>
                          {restaurant.telefone && (
                            <a href={`https://wa.me/${String(restaurant.telefone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-emerald-600 font-bold hover:underline mt-1 inline-block">
                              WhatsApp: {restaurant.telefone}
                            </a>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div>
                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 h-full">
                    <p className="font-bold text-stone-800 mb-2">Detalhes do Pedido</p>
                    {(() => {
                      const order = orders.find((o: any) => o.id === selectedReport.orderId);
                      if (!order && orders.length === 0) return <p className="text-stone-500">Carregando dados do pedido...</p>;
                      if (!order) return <p className="text-stone-500">Pedido não encontrado.</p>;
                      return (
                        <div className="space-y-2">
                          <p><span className="font-bold">ID:</span> #{String(order.id || '').slice(-5).toUpperCase()}</p>
                          <p><span className="font-bold">Status do Pedido:</span> <span className="uppercase text-xs font-bold bg-stone-200 px-2 py-1 rounded-full">{order.status}</span></p>
                          <p><span className="font-bold">Total:</span> R$ {Number(order.total || 0).toFixed(2)}</p>
                          <div className="mt-3 pt-3 border-t border-stone-200">
                            <p className="font-bold mb-1">Itens:</p>
                            <ul className="space-y-1">
                              {order.items?.map((item: any, idx: number) => (
                                <li key={idx} className="text-stone-600 text-xs">
                                  {item.quantidade}x {item.nome}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-stone-400">Criado em: {formatDate(selectedReport.createdAt)}</p>
                  {selectedReport.data_atualizacao && <p className="text-xs text-stone-400">Atualizado em: {formatDate(selectedReport.data_atualizacao)}</p>}
                  {selectedReport.data_resolucao && <p className="text-xs text-stone-400">Resolvido em: {formatDate(selectedReport.data_resolucao)}</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-600 mb-2">Atualizar Status da Denúncia</label>
                  <select 
                    value={selectedReport.status || 'pendente'}
                    onChange={(e) => handleUpdateStatus(selectedReport.id, e.target.value)}
                    className="w-full p-3 border border-stone-200 rounded-xl font-bold bg-white"
                  >
                    <option value="pendente">Pendente</option>
                    <option value="em_analise">Em Análise</option>
                    <option value="resolvida">Resolvida</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PushNotificationManagement() {
  const [notification, setNotification] = useState({ titulo: '', mensagem: '', link: '' });
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [selectedReport, setSelectedReport] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'notifications'), orderBy('data_envio', 'desc'), limit(50)));
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Não autenticado');

      const response = await fetch('/api/admin/send-notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          title: notification.titulo,
          body: notification.mensagem,
          link: notification.link
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao enviar notificações');
      }

      const result = await response.json();

      // Log to history in Firestore
      await addDoc(collection(db, 'notifications'), {
        ...notification,
        data_envio: new Date().toISOString(),
        tipo: 'global',
        successCount: result.successCount,
        failureCount: result.failureCount
      });

      setStatus({ type: 'success', message: `Notificação enviada com sucesso! (${result.successCount} enviadas, ${result.failureCount} falhas)` });
      setNotification({ titulo: '', mensagem: '', link: '' });
      
      // Refresh history
      const snap = await getDocs(query(collection(db, 'notifications'), orderBy('data_envio', 'desc'), limit(50)));
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (error: any) {
      console.error(error);
      setStatus({ type: 'error', message: error.message || 'Erro ao enviar notificações' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-stone-800">Notificações Push</h2>
        <button 
          onClick={fetchData}
          className="p-2 bg-white border border-stone-200 text-stone-600 rounded-xl hover:bg-stone-50 transition-all shadow-sm"
          title="Atualizar histórico"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>
      
      {status && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
          {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <p className="font-bold text-sm">{status.message}</p>
        </div>
      )}

      <form onSubmit={handleSend} className="bg-white p-8 rounded-3xl border border-stone-200 space-y-6">
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Título da Notificação</label>
          <input 
            value={notification.titulo}
            onChange={e => setNotification({...notification, titulo: e.target.value})}
            className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20"
            placeholder="Ex: Cupom de 20% OFF disponível!"
            required
            disabled={loading}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Mensagem</label>
          <textarea 
            value={notification.mensagem}
            onChange={e => setNotification({...notification, mensagem: e.target.value})}
            className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 h-32 resize-none"
            placeholder="Escreva o conteúdo da mensagem aqui..."
            required
            disabled={loading}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase">Link de Redirecionamento (Opcional)</label>
          <input 
            type="text"
            value={notification.link}
            onChange={e => setNotification({...notification, link: e.target.value})}
            className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20"
            placeholder="Ex: https://seusite.com/promocao ou /restaurante/123"
            disabled={loading}
          />
        </div>
        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Bell className="w-5 h-5" />
              Enviar para todos os usuários
            </>
          )}
        </button>
      </form>

      <div className="space-y-4">
        <h3 className="font-bold text-stone-800">Histórico de Envios</h3>
        {history.map(h => (
          <div key={h.id} className="bg-white p-4 rounded-2xl border border-stone-100 flex items-center justify-between">
            <div>
              <p className="font-bold text-stone-800">{h.titulo}</p>
              <p className="text-xs text-stone-500">{new Date(h.data_envio).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setSelectedReport(h)}
                className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                title="Ver relatório"
              >
                <Eye className="w-5 h-5" />
              </button>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase">Enviado</span>
            </div>
          </div>
        ))}
      </div>

      {selectedReport && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-stone-800">Relatório de Envio</h3>
              <button onClick={() => setSelectedReport(null)} className="p-2 hover:bg-stone-100 rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-stone-50 rounded-2xl">
                <p className="text-xs font-bold text-stone-400 uppercase">Título</p>
                <p className="font-bold text-stone-800">{selectedReport.titulo}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-50 rounded-2xl">
                  <p className="text-xs font-bold text-emerald-600 uppercase">Sucessos</p>
                  <p className="text-2xl font-black text-emerald-700">{selectedReport.successCount || 0}</p>
                </div>
                <div className="p-4 bg-red-50 rounded-2xl">
                  <p className="text-xs font-bold text-red-600 uppercase">Falhas</p>
                  <p className="text-2xl font-black text-red-700">{selectedReport.failureCount || 0}</p>
                </div>
              </div>
              <div className="p-4 bg-stone-50 rounded-2xl">
                <p className="text-xs font-bold text-stone-400 uppercase">Total Alcançado</p>
                <p className="text-2xl font-black text-stone-800">{(selectedReport.successCount || 0) + (selectedReport.failureCount || 0)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminStats({ restaurants, users, orders }: any) {
  const today = new Date().toISOString().split('T')[0];
  const ordersToday = orders.filter((o: any) => o.data_criacao?.startsWith(today));
  const activeRestaurants = restaurants.filter((r: any) => r.status_aprovacao === 'aprovado' && r.status_operacao !== 'suspenso');
  
  const totalVendas = orders.reduce((acc: any, o: any) => acc + (o.valor_total || 0), 0);
  const ticketMedio = orders.length > 0 ? totalVendas / orders.length : 0;

  const stats = [
    { 
      label: 'Pedidos Hoje', 
      value: ordersToday.length, 
      icon: ShoppingBag, 
      color: 'text-emerald-600',
      bg: 'bg-emerald-50'
    },
    { 
      label: 'Restaurantes Ativos', 
      value: activeRestaurants.length, 
      icon: Store, 
      color: 'text-blue-600',
      bg: 'bg-blue-50'
    },
    { 
      label: 'Usuários Cadastrados', 
      value: users.length, 
      icon: Users, 
      color: 'text-purple-600',
      bg: 'bg-purple-50'
    },
    { 
      label: 'Faturamento Hoje', 
      value: `R$ ${ordersToday.reduce((acc: any, o: any) => acc + (o.valor_total || 0), 0).toFixed(2)}`, 
      icon: LayoutDashboard, 
      color: 'text-orange-600',
      bg: 'bg-orange-50'
    },
    { 
      label: 'Ticket Médio', 
      value: `R$ ${ticketMedio.toFixed(2)}`, 
      icon: BarChart3, 
      color: 'text-pink-600',
      bg: 'bg-pink-50'
    },
    { 
      label: 'Faturamento Total', 
      value: `R$ ${totalVendas.toFixed(2)}`, 
      icon: BarChart3, 
      color: 'text-indigo-600',
      bg: 'bg-indigo-50'
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
      {stats.map(stat => (
        <div key={stat.label} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-2xl ${stat.bg}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
          </div>
          <p className="text-stone-400 font-bold text-[10px] uppercase tracking-widest">{stat.label}</p>
          <h3 className="text-lg font-black text-stone-800 mt-1">{stat.value}</h3>
        </div>
      ))}
    </div>
  );
}

function OrderManagement({ restaurants, users }: any) {
  const [localOrders, setLocalOrders] = useState<any[]>([]);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [restaurantFilter, setRestaurantFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [allCities, setAllCities] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [customerData, setCustomerData] = useState<any>(null);
  const [addressData, setAddressData] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastOrderElementRef = useCallback((node: any) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        fetchOrders(true);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  const fetchOrders = async (isNextPage = false) => {
    if (loading || (!isNextPage && !hasMore)) return;
    if (!statusFilter && !restaurantFilter && !startDate && !endDate && !cityFilter) {
      setLocalOrders([]);
      return;
    }

    setLoading(true);
    try {
      const constraints: QueryConstraint[] = [
        orderBy('data_criacao', 'desc'),
        limit(20)
      ];

      if (startDate) {
        constraints.push(where('data_criacao', '>=', new Date(startDate).toISOString()));
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        constraints.push(where('data_criacao', '<=', end.toISOString()));
      }
      if (cityFilter) {
        constraints.push(where('cidade', '==', cityFilter));
      }

      if (isNextPage && lastDoc) {
        constraints.push(startAfter(lastDoc));
      }

      let q;
      if (restaurantFilter) {
        const baseRef = collection(db, 'restaurants', restaurantFilter, 'orders');
        if (statusFilter) {
          q = query(baseRef, where('status', '==', statusFilter), ...constraints);
        } else {
          q = query(baseRef, ...constraints);
        }
      } else {
        const baseRef = collectionGroup(db, 'orders');
        if (statusFilter) {
          q = query(baseRef, where('status', '==', statusFilter), ...constraints);
        } else {
          q = query(baseRef, ...constraints);
        }
      }

      const snap = await getDocs(q);
      const newOrders = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) }));
      
      if (isNextPage) {
        setLocalOrders(prev => [...prev, ...newOrders]);
      } else {
        setLocalOrders(newOrders);
      }

      setLastDoc(snap.docs[snap.docs.length - 1]);
      setHasMore(snap.docs.length === 20);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchAllCities = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'cidades'), where('ativo', '==', true), orderBy('nome')));
        setAllCities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching all cities:", error);
      }
    };
    fetchAllCities();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLocalOrders([]);
      setLastDoc(null);
      setHasMore(true);
      if (statusFilter || restaurantFilter || startDate || endDate || cityFilter) {
        fetchOrders(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [statusFilter, restaurantFilter, startDate, endDate, cityFilter]);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!selectedOrder) {
        setCustomerData(null);
        setAddressData(null);
        return;
      }

      setLoadingDetails(true);
      try {
        // Fetch customer data
        const userDoc = await getDoc(doc(db, 'users', selectedOrder.cliente_id));
        if (userDoc.exists()) {
          setCustomerData(userDoc.data());
        } else {
          setCustomerData(null);
        }
        
        // Fetch address data
        if (selectedOrder.endereco_entrega) {
          setAddressData(selectedOrder.endereco_entrega);
        } else if (selectedOrder.endereco_id && selectedOrder.cliente_id) {
          const addrDoc = await getDoc(doc(db, 'users', selectedOrder.cliente_id, 'enderecos', selectedOrder.endereco_id));
          if (addrDoc.exists()) {
            setAddressData(addrDoc.data());
          } else {
            setAddressData(null);
          }
        } else {
          setAddressData(null);
        }
      } catch (error) {
        console.error("Error fetching details", error);
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchDetails();
  }, [selectedOrder?.id]);

  const filteredOrders = useMemo(() => {
    return localOrders.filter((o: any) => {
      const userName = users?.find((u: any) => u.id === o.cliente_id)?.nome || o.usuario_nome || o.cliente_nome || '';
      const restName = o.restaurant_nome || o.restaurante_nome || '';
      
      const matchesSearch = o.id.toLowerCase().includes(filter.toLowerCase()) ||
        restName.toLowerCase().includes(filter.toLowerCase()) ||
        userName.toLowerCase().includes(filter.toLowerCase());
      
      return matchesSearch;
    });
  }, [localOrders, filter, users]);

  const handleUpdateOrderStatus = async (order: any, newStatus: string, reason?: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (reason) updateData.motivo_cancelamento = reason;
      if (newStatus === 'rejeitado' || newStatus === 'cancelado') updateData.data_cancelamento = new Date().toISOString();
      if (newStatus === 'aceito') updateData.data_aceite = new Date().toISOString();
      if (newStatus === 'despachado') updateData.data_despacho = new Date().toISOString();
      if (newStatus === 'finalizado') updateData.data_finalizacao = new Date().toISOString();

      await updateDoc(doc(db, 'restaurants', order.restaurante_id, 'orders', order.id), updateData);
      
      // Update local state to reflect changes immediately
      setSelectedOrder({ ...order, ...updateData });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `restaurants/${order.restaurante_id}/orders/${order.id}`);
    }
  };

  const handleCancelOrder = async (order: any) => {
    if (confirm('Deseja realmente cancelar este pedido?')) {
      await handleUpdateOrderStatus(order, 'cancelado', 'Cancelado pelo administrador');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-stone-800">Gerenciar Pedidos</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-stone-200">
            <Calendar className="w-4 h-4 text-stone-400" />
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="text-xs font-bold text-stone-600 focus:outline-none"
            />
            <span className="text-stone-300">até</span>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="text-xs font-bold text-stone-600 focus:outline-none"
            />
          </div>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <select
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 w-48 appearance-none"
            >
              <option value="">Todas as Cidades</option>
              {allCities.map(c => (
                <option key={c.id} value={c.nome}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input 
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Buscar pedido..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <select
            value={restaurantFilter}
            onChange={e => setRestaurantFilter(e.target.value)}
            className="p-2 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Todos os Restaurantes</option>
            {restaurants.map((r: any) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="p-2 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">Todos os Status</option>
            <option value="pendente">Pendente</option>
            <option value="aceito">Aceito</option>
            <option value="preparo">Em Preparo</option>
            <option value="pronto">Pronto</option>
            <option value="entrega">Em Entrega</option>
            <option value="entregue">Entregue</option>
            <option value="cancelado">Cancelado</option>
            <option value="rejeitado">Rejeitado</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="p-4 font-bold text-stone-600">ID / Data</th>
                <th className="p-4 font-bold text-stone-600">Restaurante</th>
                <th className="p-4 font-bold text-stone-600">Valor</th>
                <th className="p-4 font-bold text-stone-600">Status</th>
                <th className="p-4 font-bold text-stone-600 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 && !loading && (statusFilter || restaurantFilter || startDate || endDate || cityFilter) && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-stone-500">
                    Nenhum pedido encontrado com os filtros selecionados.
                  </td>
                </tr>
              )}
              {filteredOrders.length === 0 && !loading && !statusFilter && !restaurantFilter && !startDate && !endDate && !cityFilter && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-stone-500">
                    Selecione um filtro (restaurante, status, data ou cidade) para visualizar os pedidos.
                  </td>
                </tr>
              )}
              {filteredOrders.map((order: any, index: number) => (
                <tr 
                  key={order.id} 
                  ref={index === filteredOrders.length - 1 ? lastOrderElementRef : null}
                  className="border-b border-stone-100 hover:bg-stone-50 transition-colors"
                >
                  <td className="p-4">
                    <p className="font-bold text-stone-800">#{order.id.slice(-6).toUpperCase()}</p>
                    <p className="text-[10px] text-stone-400">{new Date(order.data_criacao).toLocaleString()}</p>
                  </td>
                  <td className="p-4">
                    <p className="font-bold text-stone-800">{order.restaurant_nome || order.restaurante_nome || 'Restaurante não identificado'}</p>
                    <p className="text-[10px] text-stone-400">{users?.find((u: any) => u.id === order.cliente_id)?.nome || order.usuario_nome || order.cliente_nome || 'Cliente não identificado'}</p>
                  </td>
                  <td className="p-4">
                    <p className="font-bold text-stone-800">R$ {order.valor_total?.toFixed(2)}</p>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      ['entregue', 'finalizado'].includes(order.status) ? 'bg-emerald-100 text-emerald-600' :
                      ['cancelado', 'rejeitado'].includes(order.status) ? 'bg-red-100 text-red-600' :
                      'bg-orange-100 text-orange-600'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => setSelectedOrder(order)}
                      className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={5} className="p-4 text-center">
                    <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50 shrink-0">
              <div>
                <h3 className="text-xl font-bold text-stone-800">Pedido #{selectedOrder.id.slice(-6).toUpperCase()}</h3>
                <p className="text-sm text-stone-500 flex items-center gap-1 mt-1">
                  <Clock className="w-4 h-4" /> Realizado às {new Date(selectedOrder.data_criacao).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-stone-200 rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Items */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4" /> Itens do Pedido
                    </h3>
                    <div className="space-y-4">
                      {selectedOrder.itens?.map((item: any, idx: number) => (
                        <div key={idx} className="flex gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                          <div className="w-8 h-8 bg-stone-200 text-stone-700 rounded-lg flex items-center justify-center font-bold shrink-0">
                            {item.quantidade}x
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <h4 className="font-bold text-stone-800">{item.nome}</h4>
                              <span className="font-bold text-stone-600">R$ {(item.preco * item.quantidade).toFixed(2)}</span>
                            </div>
                            {item.observacao && (
                              <p className="text-sm text-orange-600 mt-1 bg-orange-50 p-2 rounded-lg border border-orange-100">
                                <span className="font-bold">Obs:</span> {item.observacao}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-2">
                    <div className="flex justify-between text-sm text-stone-600">
                      <span>Subtotal</span>
                      <span>R$ {selectedOrder.valor_produtos?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-stone-600">
                      <span>Taxa de Entrega</span>
                      <span>R$ {selectedOrder.taxa_entrega?.toFixed(2)}</span>
                    </div>
                    {selectedOrder.valor_desconto > 0 && (
                      <div className="flex justify-between text-sm text-red-600 font-medium">
                        <span>Desconto {selectedOrder.cupom_codigo && `(${selectedOrder.cupom_codigo})`}</span>
                        <span>- R$ {selectedOrder.valor_desconto?.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-stone-200 flex justify-between font-bold text-lg text-stone-800">
                      <span>Total</span>
                      <span className="text-emerald-600">R$ {selectedOrder.valor_total?.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Customer, Delivery & Payment */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Store className="w-4 h-4" /> Restaurante
                    </h3>
                    <div className="p-4 border border-stone-200 rounded-2xl space-y-3">
                      <p className="font-bold text-stone-800 text-lg">{selectedOrder.restaurant_nome || selectedOrder.restaurante_nome || 'Restaurante não identificado'}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <User className="w-4 h-4" /> Cliente
                    </h3>
                    <div className="p-4 border border-stone-200 rounded-2xl space-y-3">
                      {loadingDetails ? (
                        <div className="animate-pulse h-10 bg-stone-100 rounded-xl"></div>
                      ) : (
                        <>
                          <p className="font-bold text-stone-800 text-lg">{customerData?.nome || selectedOrder.usuario_nome || selectedOrder.cliente_nome || 'Cliente não identificado'}</p>
                          {(customerData?.telefone || selectedOrder.cliente_telefone) && (
                            <p className="text-stone-600 flex items-center gap-2">
                              <Phone className="w-4 h-4 text-stone-400" /> {customerData?.telefone || selectedOrder.cliente_telefone}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> Entrega
                    </h3>
                    <div className="p-4 border border-stone-200 rounded-2xl">
                      <div className="mb-3 pb-3 border-b border-stone-100">
                        <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase ${selectedOrder.tipo_entrega === 'retirada' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                          {selectedOrder.tipo_entrega === 'retirada' ? 'Retirada no Local' : 'Entrega'}
                        </span>
                      </div>
                      {loadingDetails ? (
                        <div className="animate-pulse h-20 bg-stone-100 rounded-xl"></div>
                      ) : addressData || selectedOrder.endereco ? (
                        <div className="space-y-1">
                          <p className="font-bold text-stone-800">
                            {(addressData?.rua || addressData?.logradouro || selectedOrder.endereco?.rua || selectedOrder.endereco?.logradouro)}, {(addressData?.numero || selectedOrder.endereco?.numero)}
                          </p>
                          <p className="text-stone-600 text-sm">
                            {(addressData?.bairro || selectedOrder.endereco?.bairro)} - {(addressData?.cidade || selectedOrder.endereco?.cidade)}/{(addressData?.estado || selectedOrder.endereco?.estado)}
                          </p>
                          {(addressData?.complemento || selectedOrder.endereco?.complemento) && (
                            <p className="text-stone-500 text-sm mt-2">
                              <span className="font-bold">Complemento:</span> {(addressData?.complemento || selectedOrder.endereco?.complemento)}
                            </p>
                          )}
                          {(addressData?.referencia || selectedOrder.endereco?.referencia) && (
                            <p className="text-stone-500 text-sm">
                              <span className="font-bold">Referência:</span> {(addressData?.referencia || selectedOrder.endereco?.referencia)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-stone-500 italic">Retirada no local ou endereço não informado.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" /> Pagamento
                    </h3>
                    <div className="p-4 border border-stone-200 rounded-2xl flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-stone-800 uppercase">{selectedOrder?.forma_pagamento || 'Não informada'}</p>
                        <p className="text-xs text-stone-500 uppercase tracking-wider">Pagamento na entrega</p>
                        {selectedOrder?.forma_pagamento === 'dinheiro' && selectedOrder?.troco && (
                          <p className="text-sm font-bold text-orange-600 mt-1">Troco para R$ {typeof selectedOrder.troco === 'number' ? selectedOrder.troco.toFixed(2) : selectedOrder.troco}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="p-6 border-t border-stone-200 bg-stone-50 shrink-0">
              {selectedOrder.status === 'pendente' && (
                <div className="flex gap-4 justify-end">
                  <button 
                    onClick={() => handleUpdateOrderStatus(selectedOrder, 'rejeitado', 'Cancelado pelo administrador')}
                    className="px-6 py-3 bg-white border-2 border-red-100 text-red-600 font-bold rounded-xl hover:bg-red-50 hover:border-red-200 transition-all flex items-center gap-2"
                  >
                    <X className="w-5 h-5" /> Rejeitar Pedido
                  </button>
                  <button 
                    onClick={() => handleUpdateOrderStatus(selectedOrder, 'aceito')}
                    className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
                  >
                    <Check className="w-5 h-5" /> Aceitar Pedido
                  </button>
                </div>
              )}

              {selectedOrder.status === 'aceito' && (
                <div className="flex gap-4 justify-end">
                  <button 
                    onClick={() => handleUpdateOrderStatus(selectedOrder, 'despachado')}
                    className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
                  >
                    <Bike className="w-5 h-5" /> Despachar Pedido
                  </button>
                </div>
              )}

              {selectedOrder.status === 'despachado' && (
                <div className="flex gap-4 justify-end">
                  <button 
                    onClick={() => handleUpdateOrderStatus(selectedOrder, 'finalizado')}
                    className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" /> Concluir Pedido
                  </button>
                </div>
              )}
              
              {selectedOrder.status === 'finalizado' && (
                <div className="flex justify-end">
                  <p className="text-emerald-600 font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> Pedido Finalizado
                  </p>
                </div>
              )}

              {(selectedOrder.status === 'cancelado' || selectedOrder.status === 'rejeitado') && (
                <div className="flex flex-col items-end gap-2">
                  <p className="text-red-600 font-bold flex items-center gap-2">
                    <X className="w-5 h-5" /> Pedido Cancelado/Rejeitado
                  </p>
                  {selectedOrder.motivo_cancelamento && (
                    <p className="text-sm text-stone-500">
                      <span className="font-bold">Motivo:</span> {selectedOrder.motivo_cancelamento}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RestaurantManagement({ restaurants, categories }: any) {
  const [filter, setFilter] = useState('');
  const [editingRestaurant, setEditingRestaurant] = useState<any>(null);
  const [addingRestaurant, setAddingRestaurant] = useState(false);
  const [deletingRestaurantId, setDeletingRestaurantId] = useState<string | null>(null);
  const [confirmingStatusUpdate, setConfirmingStatusUpdate] = useState<{id: string, updates: any, action: string} | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [newDeliveryArea, setNewDeliveryArea] = useState({ bairro_id: '', taxa_entrega: '' });

  const [managingDeliveryAreasId, setManagingDeliveryAreasId] = useState<string | null>(null);
  const [managingSchedulesId, setManagingSchedulesId] = useState<string | null>(null);
  const [managingContractId, setManagingContractId] = useState<string | null>(null);
  const [managingFinanceId, setManagingFinanceId] = useState<string | null>(null);
  const [managingProductsId, setManagingProductsId] = useState<string | null>(null);

  const [allBairros, setAllBairros] = useState<any[]>([]);
  const fetchAllBairros = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'bairros'), limit(50)));
      setAllBairros(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter((b: any) => b.ativo));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'bairros');
    }
  }, []);

  useEffect(() => {
    fetchAllBairros();
  }, [fetchAllBairros]);

  const handleRefresh = () => {
    fetchAllBairros();
  };

  const grouped = useMemo(() => {
    const filtered = restaurants.filter((r: any) => 
      r.nome.toLowerCase().includes(filter.toLowerCase())
    );
    return {
      pending: filtered.filter((r: any) => r.status_aprovacao === 'pendente_aprovacao'),
      approved: filtered.filter((r: any) => r.status_aprovacao === 'aprovado' && r.status_operacao !== 'suspenso'),
      suspended: filtered.filter((r: any) => r.status_operacao === 'suspenso' || r.status_aprovacao === 'rejeitado')
    };
  }, [restaurants, filter]);

  const handleStatusUpdate = async (id: string, updates: any) => {
    const action = updates.status_aprovacao === 'aprovado' ? 'aprovar' : 
                   updates.status_aprovacao === 'rejeitado' ? 'rejeitar' :
                   updates.status_operacao === 'suspenso' ? 'suspender' : 'atualizar';
    
    setConfirmingStatusUpdate({ id, updates, action });
  };

  const executeStatusUpdate = async () => {
    if (!confirmingStatusUpdate) return;
    const { id, updates } = confirmingStatusUpdate;
    try {
      await updateDoc(doc(db, 'restaurants', id), {
        ...updates,
        updatedBy: auth.currentUser?.uid || 'admin',
        updatedAt: serverTimestamp()
      });
      if (updates.status_aprovacao === 'aprovado') {
        await setDoc(doc(db, 'users', id), { status_conta: 'ativo' }, { merge: true });
      }
      setConfirmingStatusUpdate(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `restaurants/${id}`);
    }
  };

  const handleDeleteRestaurant = async () => {
    if (!deletingRestaurantId) return;
    try {
      // Delete restaurant document
      await deleteDoc(doc(db, 'restaurants', deletingRestaurantId));
      // Update user role to 'cliente'
      await updateDoc(doc(db, 'users', deletingRestaurantId), {
        tipo_usuario: 'cliente'
      });
      setDeletingRestaurantId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `restaurants/${deletingRestaurantId}`);
    }
  };

  const handleSaveEdit = async (data: any) => {
    const cleanCpfCnpj = data.cpf_cnpj?.replace(/\D/g, '') || '';
    if (cleanCpfCnpj.length === 11) {
      if (!validateCPF(cleanCpfCnpj)) {
        alert('CPF inválido!');
        return;
      }
    } else if (cleanCpfCnpj.length === 14) {
      if (!validateCNPJ(cleanCpfCnpj)) {
        alert('CNPJ inválido!');
        return;
      }
    } else if (cleanCpfCnpj.length > 0) {
      alert('CPF ou CNPJ deve ter 11 ou 14 dígitos!');
      return;
    }

    setSaveLoading(true);
    try {
      const { id, ...rest } = data;
      await updateDoc(doc(db, 'restaurants', id), {
        ...rest,
        data_atualizacao: new Date().toISOString()
      });
      setEditingRestaurant(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `restaurants/${data.id}`);
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-stone-800">Gerenciar Restaurantes</h2>
        <div className="flex gap-2">
          <button 
            onClick={handleRefresh}
            className="p-2 bg-white border border-stone-200 text-stone-600 rounded-xl hover:bg-stone-50 transition-all shadow-sm"
            title="Atualizar dados"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setAddingRestaurant(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all"
          >
            <Plus className="w-5 h-5" /> Adicionar Restaurante
          </button>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input 
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Buscar restaurante..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>
      </div>

      <div className="space-y-12">
        {grouped.pending.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-sm font-bold text-orange-600 uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 bg-orange-600 rounded-full animate-pulse" />
              Aguardando Aprovação ({grouped.pending.length})
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {grouped.pending.map(r => (
                <div key={r.id}>
                  <RestaurantCard 
                    rest={r} 
                    categories={categories} 
                    onEdit={() => setEditingRestaurant(r)}
                    onStatusUpdate={handleStatusUpdate}
                    onDelete={() => setDeletingRestaurantId(r.id)}
                    onManageDeliveryAreas={() => setManagingDeliveryAreasId(r.id)}
                    onManageSchedules={() => setManagingSchedulesId(r.id)}
                    onManageContract={() => setManagingContractId(r.id)}
                    onManageProducts={() => setManagingProductsId(r.id)}
                    onManageFinance={() => setManagingFinanceId(r.id)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <h3 className="text-sm font-bold text-emerald-600 uppercase tracking-widest">Aprovados ({grouped.approved.filter(r => r.status_operacao !== 'suspenso' && r.status_aprovacao !== 'rejeitado').length})</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {grouped.approved.filter(r => r.status_operacao !== 'suspenso' && r.status_aprovacao !== 'rejeitado').map(r => (
              <div key={r.id}>
                <RestaurantCard 
                  rest={r} 
                  categories={categories} 
                  onEdit={() => setEditingRestaurant(r)}
                  onStatusUpdate={handleStatusUpdate}
                  onDelete={() => setDeletingRestaurantId(r.id)}
                  onManageDeliveryAreas={() => setManagingDeliveryAreasId(r.id)}
                  onManageSchedules={() => setManagingSchedulesId(r.id)}
                  onManageContract={() => setManagingContractId(r.id)}
                  onManageProducts={() => setManagingProductsId(r.id)}
                />
              </div>
            ))}
          </div>
        </section>

        {grouped.suspended.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-sm font-bold text-red-600 uppercase tracking-widest">Suspensos / Rejeitados ({grouped.suspended.length})</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {grouped.suspended.map(r => (
                <div key={r.id}>
                  <RestaurantCard 
                    rest={r} 
                    categories={categories} 
                    onEdit={() => setEditingRestaurant(r)}
                    onStatusUpdate={handleStatusUpdate}
                    onDelete={() => setDeletingRestaurantId(r.id)}
                    onManageDeliveryAreas={() => setManagingDeliveryAreasId(r.id)}
                    onManageSchedules={() => setManagingSchedulesId(r.id)}
                    onManageContract={() => setManagingContractId(r.id)}
                    onManageProducts={() => setManagingProductsId(r.id)}
                    onManageFinance={() => setManagingFinanceId(r.id)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {confirmingStatusUpdate && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-6 text-center">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">Confirmar Ação</h3>
            <p className="text-stone-500 mb-6">Tem certeza que deseja {confirmingStatusUpdate.action} este restaurante?</p>
            <div className="flex gap-3">
              <button 
                onClick={executeStatusUpdate}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all"
              >
                Confirmar
              </button>
              <button 
                onClick={() => setConfirmingStatusUpdate(null)}
                className="flex-1 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingRestaurantId && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-6 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">Confirmar Exclusão</h3>
            <p className="text-stone-500 mb-6 font-bold text-red-600 uppercase text-xs">Atenção: Esta ação é irreversível!</p>
            <p className="text-stone-500 mb-6">Tem certeza que deseja EXCLUIR este restaurante e todos os seus dados?</p>
            <div className="flex gap-3">
              <button 
                onClick={handleDeleteRestaurant}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all"
              >
                Excluir
              </button>
              <button 
                onClick={() => setDeletingRestaurantId(null)}
                className="flex-1 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {editingRestaurant && (
        <RestaurantForm 
          restaurant={editingRestaurant}
          categories={categories}
          onSave={handleSaveEdit}
          onCancel={() => setEditingRestaurant(null)}
        />
      )}
      {addingRestaurant && (
        <RestaurantForm 
          onSave={async (data: any) => {
            setSaveLoading(true);
            try {
              const response = await fetch('/api/admin/register-restaurant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              });
              
              if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Erro ao cadastrar restaurante');
              }
              
              setAddingRestaurant(false);
            } catch (error: any) {
              alert(error.message);
              console.error(error);
            } finally {
              setSaveLoading(false);
            }
          }}
          onCancel={() => setAddingRestaurant(false)}
        />
      )}

      {managingDeliveryAreasId && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-stone-800">Gerenciar Áreas de Entrega</h3>
              <button onClick={() => setManagingDeliveryAreasId(null)} className="p-2 hover:bg-stone-100 rounded-full transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <DeliveryAreas restaurantId={managingDeliveryAreasId} />
            </div>
          </div>
        </div>
      )}

      {managingSchedulesId && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-stone-800">Gerenciar Horários</h3>
              <button onClick={() => setManagingSchedulesId(null)} className="p-2 hover:bg-stone-100 rounded-full transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <Schedules restaurantId={managingSchedulesId} />
            </div>
          </div>
        </div>
      )}

      {/* Modal Contrato */}
      {managingContractId && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6">
            <ContractManagement restaurantId={managingContractId} />
            <button onClick={() => setManagingContractId(null)} className="mt-4 px-4 py-2 bg-stone-200 rounded-xl">Fechar</button>
          </div>
        </div>
      )}

      {/* Modal Gerenciar Produtos */}
      {managingProductsId && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
              <h3 className="text-xl font-bold text-stone-800">Gerenciar Produtos e Categorias</h3>
              <button 
                onClick={() => setManagingProductsId(null)} 
                className="p-2 hover:bg-stone-200 rounded-xl transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-stone-50/50">
              <ProductManagement restaurantId={managingProductsId} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductManagement({ restaurantId }: { restaurantId: string }) {
  const [activeTab, setActiveTab] = useState<'items' | 'categories' | 'sizes' | 'extras' | 'groups' | 'promotions'>('items');

  const tabs = [
    { id: 'items', name: 'Itens', icon: Package },
    { id: 'categories', name: 'Categorias', icon: Tag },
    { id: 'sizes', name: 'Tamanhos', icon: Box },
    { id: 'extras', name: 'Adicionais', icon: PlusCircle },
    { id: 'groups', name: 'Grupos de Opções', icon: List },
    { id: 'promotions', name: 'Promoções', icon: Percent },
  ];

  return (
    <div className="space-y-6">
      <div className="flex overflow-x-auto pb-2 gap-2 scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100'
                : 'bg-white text-stone-500 hover:bg-stone-50 border border-stone-200'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            {tab.name}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 min-h-[600px] overflow-hidden p-6">
        {activeTab === 'items' && <RestaurantProducts adminRestaurantId={restaurantId} />}
        {activeTab === 'categories' && <RestaurantCategories adminRestaurantId={restaurantId} />}
        {activeTab === 'sizes' && <RestaurantSizes adminRestaurantId={restaurantId} />}
        {activeTab === 'extras' && <RestaurantExtras adminRestaurantId={restaurantId} />}
        {activeTab === 'groups' && <OptionGroups adminRestaurantId={restaurantId} />}
        {activeTab === 'promotions' && <RestaurantPromotions adminRestaurantId={restaurantId} />}
      </div>
    </div>
  );
}

function ContractManagement({ restaurantId }: { restaurantId: string }) {
  const [monthlyFee, setMonthlyFee] = useState<number>(0);
  const [commissionType, setCommissionType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [commissionValue, setCommissionValue] = useState<number>(0);
  const [dueDate, setDueDate] = useState<number>(1);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContract = async () => {
      setLoading(true);
      setError(null);
      try {
        const docRef = doc(db, 'restaurants', restaurantId, 'contract', 'details');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setMonthlyFee(data.mensalidade || 0);
          setCommissionType(data.comissao?.tipo || 'none');
          setCommissionValue(data.comissao?.valor || 0);
          setDueDate(data.vencimentoDia || 1);
          setIsActive(data.ativo ?? true);
        } else {
          setMonthlyFee(0);
          setCommissionType('none');
          setCommissionValue(0);
          setDueDate(1);
          setIsActive(true);
        }
      } catch (err) {
        console.error('Error fetching contract:', err);
        setError('Falha ao carregar contrato.');
      } finally {
        setLoading(false);
      }
    };

    fetchContract();
  }, [restaurantId]);

  const handleSaveContract = async () => {
    setLoading(true);
    setError(null);
    try {
      const contractData = {
        mensalidade: monthlyFee,
        comissao: {
          tipo: commissionType === 'none' ? null : commissionType,
          valor: commissionType === 'none' ? null : commissionValue,
        },
        vencimentoDia: dueDate,
        ativo: isActive,
      };
      await setDoc(doc(db, 'restaurants', restaurantId, 'contract', 'details'), contractData, { merge: true });
      alert('Contrato salvo com sucesso!');
    } catch (err) {
      console.error('Error saving contract:', err);
      setError('Falha ao salvar contrato.');
    } finally {
      setLoading(false);
    }
  };

  const commissionTypeOptions = [
    { label: 'Nenhuma', value: 'none' },
    { label: 'Comissão por pedido (%)', value: 'percentage' },
    { label: 'Comissão por pedido (R$)', value: 'fixed' },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-stone-800">Gerenciar Contrato</h3>
      {loading && <p>Carregando...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {!loading && !error && (
        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-stone-600 mb-1">Mensalidade (R$)</label>
              <input
                type="number"
                value={monthlyFee}
                onChange={(e) => setMonthlyFee(parseFloat(e.target.value) || 0)}
                className="w-full p-3 border border-stone-300 rounded-xl focus:ring-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-stone-600 mb-1">Dia de Vencimento</label>
              <input
                type="number"
                value={dueDate}
                onChange={(e) => setDueDate(parseInt(e.target.value) || 1)}
                min="1"
                max="31"
                className="w-full p-3 border border-stone-300 rounded-xl focus:ring-emerald-500"
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold text-stone-600">Contrato Ativo</label>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-5 h-5 text-emerald-600 focus:ring-emerald-500 border-stone-300 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-stone-600 mb-1">Tipo de Comissão</label>
              <select
                value={commissionType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCommissionType(e.target.value as 'none' | 'percentage' | 'fixed')}
                className="w-full p-3 border border-stone-300 rounded-xl focus:ring-emerald-500"
              >
                {commissionTypeOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            {commissionType !== 'none' && (
              <div>
                <label className="block text-sm font-bold text-stone-600 mb-1">Valor da Comissão</label>
                <input
                  type="number"
                  value={commissionValue}
                  onChange={(e) => setCommissionValue(parseFloat(e.target.value) || 0)}
                  className="w-full p-3 border border-stone-300 rounded-xl focus:ring-emerald-500"
                  required
                />
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex justify-end mt-6">
        <button
          onClick={handleSaveContract}
          disabled={loading}
          className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Salvando...' : 'Salvar Contrato'}
        </button>
      </div>
    </div>
  );
}

function RestaurantCard({ rest, categories, onEdit, onStatusUpdate, onDelete, onManageDeliveryAreas, onManageSchedules, onManageContract, onManageProducts }: any) {
  const [schedules, setSchedules] = useState<any[]>([]);

  useEffect(() => {
    const fetchSchedules = async () => {
      const data = await scheduleService.getSchedulesByRestaurant(rest.id);
      setSchedules(data);
    };
    fetchSchedules();
  }, [rest.id]);

  const handleEdit = async () => {
    onEdit({ ...rest, horarios_funcionamento: schedules });
  };

  const isOpen = isRestaurantOpen(rest, schedules);
  return (
    <div className="bg-white p-6 rounded-3xl border border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:shadow-md transition-all">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 bg-stone-100 rounded-2xl overflow-hidden shrink-0">
          <img src={rest.logoUrl || rest.logo_url || 'https://picsum.photos/seed/logo/100/100'} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
        </div>
        <div>
          <h3 className="font-bold text-lg text-stone-800">{rest.nome}</h3>
          <div className="flex flex-wrap gap-1 mt-1">
            {(() => {
              const cats = Array.isArray(rest.categorias) ? rest.categorias : 
                           (Array.isArray(rest.categoria_id) ? rest.categoria_id : 
                           (rest.categoria_id ? [rest.categoria_id] : []));
              
              if (cats.length === 0) return <span className="text-[10px] text-stone-400 font-bold uppercase">Sem categoria</span>;
              
              return cats.map((catId: string) => {
                const category = categories.find((c: any) => c.id === catId || c.nome === catId);
                return (
                  <span key={catId} className="text-[10px] text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                    {category?.nome || catId}
                  </span>
                );
              });
            })()}
          </div>
          <div className="flex gap-2 mt-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${isOpen ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
              {isOpen ? 'Aberto' : 'Fechado'} ({rest.status_operacao_config === 'automatico' ? 'Automático' : (rest.status_operacao_config || 'auto')})
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-stone-100 text-stone-600 rounded-full uppercase flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {rest.tempo_min_entrega || 0}-{rest.tempo_max_entrega || 0} min
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 justify-end">
         <button 
          onClick={onManageProducts}
          className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
          title="Produtos"
        >
          <Package className="w-5 h-5" />
        </button>
        <button 
          onClick={onManageContract}
          className="p-2 text-stone-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all"
          title="Contrato"
        >
          <FileText className="w-5 h-5" />
        </button>
        <button 
          onClick={onManageSchedules}
          className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
          title="Horários"
        >
          <Clock className="w-5 h-5" />
        </button>
        <button 
          onClick={onManageDeliveryAreas}
          className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
          title="Áreas de Entrega"
        >
          <Bike className="w-5 h-5" />
        </button>
        <button 
          onClick={handleEdit}
          className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
          title="Editar"
        >
          <Edit3 className="w-5 h-5" />
        </button>
        <button 
          onClick={onDelete}
          className="p-2 text-stone-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
          title="Excluir"
        >
          <Trash2 className="w-5 h-5" />
        </button>
        {rest.status_aprovacao === 'pendente_aprovacao' && (
          <>
            <button 
              onClick={() => onStatusUpdate(rest.id, { status_aprovacao: 'rejeitado' })}
              className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
            <button 
              onClick={() => onStatusUpdate(rest.id, { status_aprovacao: 'aprovado' })}
              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
            >
              <Check className="w-5 h-5" />
            </button>
          </>
        )}
        {rest.status_aprovacao === 'aprovado' && rest.status_operacao !== 'suspenso' && (
          <button 
            onClick={() => onStatusUpdate(rest.id, { status_operacao: 'suspenso' })}
            className="p-2 text-orange-500 hover:bg-orange-50 rounded-xl transition-all"
            title="Suspender"
          >
            <AlertTriangle className="w-5 h-5" />
          </button>
        )}
        {rest.status_operacao === 'suspenso' && (
          <button 
            onClick={() => onStatusUpdate(rest.id, { status_operacao: 'fechado' })}
            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
            title="Ativar"
          >
            <Check className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
