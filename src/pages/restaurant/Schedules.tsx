import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import { scheduleService, Schedule } from '../../services/scheduleService';
import { Clock, Loader2, Plus, Edit2, Trash2 } from 'lucide-react';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Feriados'];

export default function Schedules({ restaurantId: propRestaurantId }: { restaurantId?: string }) {
  const { profile } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [formData, setFormData] = useState<Schedule>({
    dia_semana: 'Segunda',
    hora_abertura: '08:00',
    hora_fechamento: '18:00',
    status: 'aberto'
  });
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [restaurantId, setRestaurantId] = useState<string | null>(propRestaurantId || null);

  useEffect(() => {
    if (propRestaurantId) {
      setRestaurantId(propRestaurantId);
    }
  }, [propRestaurantId]);

  const fetchSchedules = async (rid: string) => {
    try {
      const data = await scheduleService.getSchedulesByRestaurant(rid);
      setSchedules(data as Schedule[]);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching schedules:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const id = propRestaurantId || profile?.restaurantId || (profile?.uid ? (await restaurantService.getRestaurantByOwnerId(profile.uid))?.id : null);
      if (!id) {
        setLoading(false);
        return;
      }
      setRestaurantId(id);
      fetchSchedules(id);
    };

    init();
  }, [profile?.uid, profile?.restaurantId, propRestaurantId]);

  const handleOpenModal = (schedule?: Schedule) => {
    if (schedule) {
      setEditingSchedule(schedule);
      setFormData({
        dia_semana: schedule.dia_semana,
        hora_abertura: schedule.hora_abertura,
        hora_fechamento: schedule.hora_fechamento,
        status: schedule.status
      });
    } else {
      setEditingSchedule(null);
      setFormData({
        dia_semana: 'Segunda',
        hora_abertura: '08:00',
        hora_fechamento: '18:00',
        status: 'aberto'
      });
    }
    setError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSchedule(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) return;
    setSaveLoading(true);
    setError(null);

    try {
      if (editingSchedule?.id) {
        await scheduleService.updateSchedule(restaurantId, editingSchedule.id, formData);
      } else {
        await scheduleService.createSchedule(restaurantId, formData);
      }
      handleCloseModal();
      await fetchSchedules(restaurantId);
    } catch (err) {
      setError("Erro ao salvar horário.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!restaurantId || !scheduleToDelete?.id) return;
    
    setSaveLoading(true);
    try {
      await scheduleService.deleteSchedule(restaurantId, scheduleToDelete.id);
      setIsDeleteModalOpen(false);
      setScheduleToDelete(null);
      await fetchSchedules(restaurantId);
    } catch (err) {
      console.error("Error deleting schedule:", err);
      alert("Erro ao excluir horário.");
    } finally {
      setSaveLoading(false);
    }
  };

  const confirmDelete = (schedule: Schedule) => {
    setScheduleToDelete(schedule);
    setIsDeleteModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Horários de Funcionamento</h2>
          <p className="text-stone-500 text-sm">Configure os horários e dias que não abre.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
        >
          <Plus className="w-5 h-5" />
          Novo Horário
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-100">
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Dia da Semana</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Abertura</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Fechamento</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-stone-400">Carregando...</td></tr>
            ) : schedules.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-stone-400">Nenhum horário cadastrado.</td></tr>
            ) : (
              schedules.map(schedule => (
                <tr key={schedule.id} className="hover:bg-stone-50/50">
                  <td className="px-6 py-4 font-bold text-stone-800">{schedule.dia_semana}</td>
                  <td className="px-6 py-4">{schedule.status === 'aberto' ? schedule.hora_abertura : '-'}</td>
                  <td className="px-6 py-4">{schedule.status === 'aberto' ? schedule.hora_fechamento : '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${schedule.status === 'aberto' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                      {schedule.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenModal(schedule)} className="p-2 text-stone-400 hover:text-emerald-600 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => confirmDelete(schedule)} className="p-2 text-stone-400 hover:text-red-600 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-stone-800 mb-6">{editingSchedule ? 'Editar Horário' : 'Novo Horário'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">Dia da Semana *</label>
                <select required value={formData.dia_semana} onChange={e => setFormData({...formData, dia_semana: e.target.value})} className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl">
                  {DIAS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">Status</label>
                <select required value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as 'aberto' | 'fechado'})} className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl">
                  <option value="aberto">Aberto</option>
                  <option value="fechado">Fechado</option>
                </select>
              </div>

              {formData.status === 'aberto' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-stone-700 mb-1">Hora de Abertura</label>
                    <input type="time" required value={formData.hora_abertura} onChange={e => setFormData({...formData, hora_abertura: e.target.value})} className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 mb-1">Hora de Fechamento</label>
                    <input type="time" required value={formData.hora_fechamento} onChange={e => setFormData({...formData, hora_fechamento: e.target.value})} className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl" />
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">
                  {error}
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={handleCloseModal} className="flex-1 px-6 py-3 bg-stone-100 text-stone-600 font-bold rounded-2xl">Cancelar</button>
                <button type="submit" disabled={saveLoading} className="flex-1 px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl">{saveLoading ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Exclusão */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-stone-800">Excluir Horário</h3>
                <p className="text-stone-500 text-sm mt-1">
                  Tem certeza que deseja excluir o horário de <strong>{scheduleToDelete?.dia_semana}</strong>? 
                  Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex w-full gap-3 pt-2">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setScheduleToDelete(null);
                  }}
                  className="flex-1 px-4 py-3 bg-stone-100 text-stone-600 font-bold rounded-2xl hover:bg-stone-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saveLoading}
                  className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 shadow-lg shadow-red-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
