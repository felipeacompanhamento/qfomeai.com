import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { optionService, OptionGroup, OptionItem } from '../../services/optionService';
import { collection, query, orderBy, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit2, Trash2, Save, X, ChevronDown, ChevronUp, GripVertical, Loader2 } from 'lucide-react';

export default function OptionGroups({ adminRestaurantId }: { adminRestaurantId?: string }) {
  const { profile: authProfile } = useAuth();
  const profile = adminRestaurantId ? { restaurantId: adminRestaurantId } : authProfile;
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);
  const [confirmDeleteOption, setConfirmDeleteOption] = useState<{groupId: string, optionId: string} | null>(null);
  
  const [groupForm, setGroupForm] = useState({ nome: '', descricao: '', ordem: 0 });
  const [optionsByGroup, setOptionsByGroup] = useState<Record<string, OptionItem[]>>({});
  const [addingOptionTo, setAddingOptionTo] = useState<string | null>(null);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [optionForm, setOptionForm] = useState({ nome: '', preco: 0, ativo: true });
  const [saveLoading, setSaveLoading] = useState(false);

  const fetchGroups = async () => {
    if (!profile?.restaurantId) return;
    setLoading(true);
    try {
      const qGroups = query(
        collection(db, 'restaurants', profile.restaurantId, 'optionGroups'),
        orderBy('ordem', 'asc'),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(qGroups);
      const groupsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OptionGroup));
      setGroups(groupsData);
    } catch (err) {
      console.error("Error loading groups:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async (groupId: string) => {
    if (!profile?.restaurantId) return;
    try {
      const qOptions = query(
        collection(db, 'restaurants', profile.restaurantId, 'optionItems'),
        where('grupoId', '==', groupId),
        orderBy('createdAt', 'asc')
      );
      const snapshot = await getDocs(qOptions);
      const optionsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OptionItem));
      setOptionsByGroup(prev => ({ ...prev, [groupId]: optionsData }));
    } catch (err) {
      console.error("Error loading options:", err);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, [profile?.restaurantId]);

  useEffect(() => {
    if (expandedGroupId) {
      fetchOptions(expandedGroupId);
    }
  }, [profile?.restaurantId, expandedGroupId]);

  const handleSaveGroup = async () => {
    if (!profile?.restaurantId || !groupForm.nome) return;
    
    setSaveLoading(true);
    try {
      if (editingGroupId) {
        await optionService.updateGroup(profile.restaurantId, editingGroupId, groupForm);
      } else {
        await optionService.createGroup(profile.restaurantId, groupForm);
      }
      
      setGroupForm({ nome: '', descricao: '', ordem: 0 });
      setIsAddingGroup(false);
      setEditingGroupId(null);
      await fetchGroups();
    } catch (error) {
      console.error("Error saving group:", error);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!profile?.restaurantId) return;
    setSaveLoading(true);
    try {
      await optionService.deleteGroup(profile.restaurantId, id);
      setConfirmDeleteGroupId(null);
      await fetchGroups();
    } catch (error) {
      console.error("Error deleting group:", error);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSaveOption = async (groupId: string) => {
    if (!profile?.restaurantId || !optionForm.nome) return;
    
    setSaveLoading(true);
    try {
      if (editingOptionId) {
        await optionService.updateOption(profile.restaurantId, editingOptionId, {
          ...optionForm,
          grupoId: groupId
        });
      } else {
        await optionService.createOption(profile.restaurantId, {
          ...optionForm,
          grupoId: groupId
        });
      }
      
      setOptionForm({ nome: '', preco: 0, ativo: true });
      setAddingOptionTo(null);
      setEditingOptionId(null);
      await fetchOptions(groupId);
    } catch (error) {
      console.error("Error saving option:", error);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggleOptionStatus = async (groupId: string, option: OptionItem) => {
    if (!profile?.restaurantId || !option.id) return;
    try {
      await optionService.updateOption(profile.restaurantId, option.id, { 
        ativo: !option.ativo,
        grupoId: groupId
      });
      await fetchOptions(groupId);
    } catch (error) {
      console.error("Error toggling option status:", error);
    }
  };

  const handleDeleteOption = async (groupId: string, optionId: string) => {
    if (!profile?.restaurantId) return;
    setSaveLoading(true);
    try {
      await optionService.deleteOption(profile.restaurantId, optionId, groupId);
      setConfirmDeleteOption(null);
      await fetchOptions(groupId);
    } catch (error) {
      console.error("Error deleting option:", error);
    } finally {
      setSaveLoading(false);
    }
  };

  const toggleExpand = (groupId: string) => {
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
    } else {
      setExpandedGroupId(groupId);
    }
  };

  if (loading) return <div className="p-8 text-center">Carregando grupos...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Grupos de Opções</h2>
          <p className="text-stone-500 text-sm">Gerencie os grupos de adicionais e opções dos seus produtos.</p>
        </div>
        <button 
          onClick={() => {
            setIsAddingGroup(true);
            setEditingGroupId(null);
            setGroupForm({ nome: '', descricao: '', ordem: groups.length });
          }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all"
        >
          <Plus className="w-5 h-5" />
          Novo Grupo
        </button>
      </div>

      {isAddingGroup && (
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-stone-800">{editingGroupId ? 'Editar Grupo' : 'Novo Grupo'}</h3>
            <button onClick={() => setIsAddingGroup(false)} className="text-stone-400 hover:text-stone-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-bold text-stone-700 mb-1">Nome do Grupo</label>
              <input 
                type="text" 
                value={groupForm.nome}
                onChange={e => setGroupForm({...groupForm, nome: e.target.value})}
                placeholder="Ex: Escolha sua carne"
                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-bold text-stone-700 mb-1">Descrição (opcional)</label>
              <input 
                type="text" 
                value={groupForm.descricao}
                onChange={e => setGroupForm({...groupForm, descricao: e.target.value})}
                placeholder="Ex: Escolha até 2 opções"
                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-bold text-stone-700 mb-1">Ordem de Exibição</label>
              <input 
                type="number" 
                value={groupForm.ordem}
                onChange={e => setGroupForm({...groupForm, ordem: parseInt(e.target.value) || 0})}
                placeholder="0"
                className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button 
              onClick={() => setIsAddingGroup(false)}
              className="px-4 py-2 text-stone-500 font-bold hover:bg-stone-100 rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSaveGroup}
              className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all"
            >
              Salvar Grupo
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {groups.length === 0 ? (
          <div className="p-12 bg-white rounded-3xl border border-stone-200 text-center text-stone-400">
            Nenhum grupo cadastrado.
          </div>
        ) : (
          groups.map(group => (
            <div key={group.id} className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
              <div 
                className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${expandedGroupId === group.id ? 'bg-stone-50' : 'hover:bg-stone-50/50'}`}
                onClick={() => toggleExpand(group.id!)}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                    <GripVertical className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-stone-800">{group.nome}</h3>
                    {group.descricao && <p className="text-xs text-stone-500">{group.descricao}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingGroupId(group.id!);
                      setGroupForm({ 
                        nome: group.nome, 
                        descricao: group.descricao || '',
                        ordem: group.ordem || 0
                      });
                      setIsAddingGroup(true);
                    }}
                    className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                    title="Editar Grupo"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteGroupId(group.id!);
                    }}
                    className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                    title="Excluir Grupo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="ml-2 text-stone-300">
                    {expandedGroupId === group.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>
              </div>

              {expandedGroupId === group.id && (
                <div className="p-6 border-t border-stone-100 bg-white space-y-4 animate-in slide-in-from-top-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-stone-400 uppercase tracking-wider">Opções do Grupo</h4>
                    <button 
                      onClick={() => {
                        setAddingOptionTo(group.id!);
                        setEditingOptionId(null);
                        setOptionForm({ nome: '', preco: 0, ativo: true });
                      }}
                      className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Adicionar Opção
                    </button>
                  </div>

                  {(addingOptionTo === group.id || editingOptionId) && (
                    <div className="flex flex-col sm:flex-row gap-2 p-3 bg-stone-50 rounded-2xl border border-stone-100 animate-in fade-in slide-in-from-top-2">
                      <input 
                        type="text" 
                        value={optionForm.nome}
                        onChange={e => setOptionForm({...optionForm, nome: e.target.value})}
                        placeholder="Nome da opção"
                        className="flex-1 px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:border-emerald-500 transition-all"
                      />
                      <input 
                        type="number" 
                        value={optionForm.preco}
                        onChange={e => setOptionForm({...optionForm, preco: parseFloat(e.target.value) || 0})}
                        placeholder="Preço"
                        className="w-full sm:w-24 px-3 py-2 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:border-emerald-500 transition-all"
                      />
                      <div className="flex gap-1">
                        <button 
                          onClick={() => handleSaveOption(group.id!)}
                          disabled={saveLoading}
                          className="flex-1 sm:flex-none p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center disabled:opacity-50"
                        >
                          {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </button>
                        <button 
                          onClick={() => {
                            setAddingOptionTo(null);
                            setEditingOptionId(null);
                          }}
                          className="flex-1 sm:flex-none p-2 bg-stone-200 text-stone-500 rounded-xl hover:bg-stone-300 transition-all flex items-center justify-center"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {!optionsByGroup[group.id!] || optionsByGroup[group.id!].length === 0 ? (
                      <p className="text-sm text-stone-400 italic">Nenhuma opção cadastrada.</p>
                    ) : (
                      optionsByGroup[group.id!].map(option => (
                        <div key={option.id} className="flex items-center justify-between p-3 bg-stone-50/50 rounded-xl border border-stone-100 group">
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => handleToggleOptionStatus(group.id!, option)}
                              className={`w-10 h-5 rounded-full transition-all relative ${option.ativo ? 'bg-emerald-500' : 'bg-stone-300'}`}
                            >
                              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${option.ativo ? 'right-1' : 'left-1'}`} />
                            </button>
                            <span className={`font-medium ${option.ativo ? 'text-stone-700' : 'text-stone-400 line-through'}`}>{option.nome}</span>
                            <span className={`font-bold text-sm ${option.ativo ? 'text-emerald-600' : 'text-stone-400'}`}>+ R$ {option.preco.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center gap-1 sm:gap-2">
                            <button 
                              onClick={() => {
                                setEditingOptionId(option.id!);
                                setOptionForm({ nome: option.nome, preco: option.preco, ativo: option.ativo });
                                setAddingOptionTo(null);
                              }}
                              className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                              title="Editar Opção"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setConfirmDeleteOption(option.id ? { groupId: group.id!, optionId: option.id } : null)}
                              className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                              title="Excluir Opção"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modais de Confirmação */}
      {confirmDeleteGroupId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-stone-800 mb-2">Excluir Grupo?</h3>
            <p className="text-stone-500 text-sm mb-6">
              Esta ação excluirá o grupo e todas as suas opções permanentemente.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmDeleteGroupId(null)}
                className="flex-1 px-4 py-2 bg-stone-100 text-stone-600 font-bold rounded-xl hover:bg-stone-200 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={() => handleDeleteGroup(confirmDeleteGroupId)}
                disabled={saveLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteOption && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-stone-800 mb-2">Excluir Opção?</h3>
            <p className="text-stone-500 text-sm mb-6">
              Esta ação excluirá esta opção permanentemente.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmDeleteOption(null)}
                className="flex-1 px-4 py-2 bg-stone-100 text-stone-600 font-bold rounded-xl hover:bg-stone-200 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={() => handleDeleteOption(confirmDeleteOption.groupId, confirmDeleteOption.optionId)}
                disabled={saveLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
