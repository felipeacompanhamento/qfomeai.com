import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { restaurantService } from '../../../services/restaurantService';
import { Users, Phone, ShoppingBag, Calendar, MessageSquare, RefreshCw } from 'lucide-react';
import {
  PageHeader,
  Badge,
  Button,
  DataTableContainer,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  DataTableToolbar,
  DataTableEmptyState,
  DataTableSkeleton,
  Pagination,
} from '../../../components/ui';

const PAGE_SIZE = 30;

export default function ClientesPage() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalClients, setTotalClients] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchClientsPage = async (targetPage: number) => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const res = await restaurantService.getRestaurantClientsPaginated(restaurantId, targetPage, PAGE_SIZE);
      setClients(res.clients || []);
      setHasMore(res.hasMore);
      setTotalClients(res.totalClients || 0);
      setTotalPages(res.totalPages || 1);
      setPage(res.currentPage || targetPage);
    } catch (err) {
      console.error('Error fetching paginated clients:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchClientsPage(1);
  }, [restaurantId]);

  const handleNextPage = () => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    fetchClientsPage(nextPage);
  };

  const handlePrevPage = () => {
    if (page <= 1 || loading) return;
    const prevPage = page - 1;
    fetchClientsPage(prevPage);
  };

  const handleRefresh = () => {
    fetchClientsPage(page);
  };

  const filteredClients = clients.filter(c =>
    (c.nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.telefone || '').includes(searchTerm)
  );

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Base de Clientes"
        description="Histórico paginado de clientes do restaurante (isolado por estabelecimento)."
        icon={Users}
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            loading={loading}
            icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Atualizar
          </Button>
        }
      />

      <DataTableContainer>
        <DataTableToolbar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar cliente por nome ou telefone..."
        />

        {loading ? (
          <DataTableSkeleton columns={5} rows={6} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefone / WhatsApp</TableHead>

                <TableHead align="center">Pedidos Realizados</TableHead>
                <TableHead>Último Pedido</TableHead>
                <TableHead align="right">Total Gasto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.length === 0 ? (
                <DataTableEmptyState
                  icon={Users}
                  title="Nenhum cliente encontrado"
                  description="Nenhum cliente atendeu aos critérios da busca na página atual."
                  colSpan={5}
                />
              ) : (
                filteredClients.map((client) => {
                  const rawPhone = client.telefone ? client.telefone.replace(/\D/g, '') : '';
                  return (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="font-bold text-stone-800">{client.nome}</div>
                      </TableCell>
                      <TableCell>
                        {client.telefone ? (
                          <div className="flex items-center gap-2">
                            <span className="text-stone-600 font-medium">{client.telefone}</span>
                            {rawPhone && (
                              <a
                                href={`https://wa.me/55${rawPhone}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Enviar mensagem no WhatsApp para ${client.nome}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] rounded-lg border border-emerald-200/80 transition-all"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>WhatsApp</span>
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-stone-400 italic text-xs">Não informado</span>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Badge variant="success" size="sm" icon={<ShoppingBag className="w-3 h-3" />}>
                          {client.totalPedidos} {client.totalPedidos === 1 ? 'pedido' : 'pedidos'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-stone-600 font-medium">
                          {client.ultimoPedido ? new Date(client.ultimoPedido).toLocaleDateString('pt-BR') : '-'}
                        </span>
                      </TableCell>
                      <TableCell align="right">
                        <span className="font-bold text-stone-900">
                          R$ {(client.valorTotal || 0).toFixed(2)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </DataTableContainer>

      {/* Pagination Controls Footer */}
      {!loading && filteredClients.length > 0 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalClients}
          onPageChange={(p) => {
            if (p > page) handleNextPage();
            else handlePrevPage();
          }}
          infoText={
            <>
              Exibindo <span className="font-bold text-stone-800">{filteredClients.length}</span> clientes nesta página • Total de <span className="font-bold text-stone-800">{totalClients}</span> clientes cadastrados ({PAGE_SIZE} por página)
            </>
          }
        />
      )}
    </div>
  );
}


