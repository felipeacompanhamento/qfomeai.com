import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import { productService, Product } from '../../services/productService';
import { optionService, OptionGroup } from '../../services/optionService';
import { Plus, Edit2, Trash2, X, Check, AlertCircle, Loader2, Image as ImageIcon, Search, Filter, Settings2, ArrowRightLeft, History, CheckCircle2 } from 'lucide-react';
import {
  Button,
  IconButton,
  PageHeader,
  Badge,
  DataTableContainer,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  DataTableToolbar,
  DataTableSkeleton,
  DataTableEmptyState,
  FormModal,
  FormSection,
  FieldGroup,
  FormField,
  TextInput,
  SelectInput,
  TextareaInput,
  Switch,
  Checkbox,
  PrimaryButton,
  SecondaryButton,
  Select,
  Input,
  Textarea,
  InlineFeedback,
  ConfirmDialog,
} from '../../components/ui';
import { 
  normalizeProductSalesChannels, 
  normalizeProductChannelPricing, 
  DEFAULT_PRODUCT_SALES_CHANNELS, 
  ProductSalesChannels, 
  ProductChannelPricing 
} from '../../domain/product/productChannels';
import PlaceholderImage from '../../components/PlaceholderImage';
import ImageUpload from '../../components/ImageUpload';

export default function RestaurantProducts({ adminRestaurantId }: { adminRestaurantId?: string }) {
  const { user, profile } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(adminRestaurantId || null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [sizes, setSizes] = useState<any[]>([]);
  const [availableGroups, setAvailableGroups] = useState<OptionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [productForStock, setProductForStock] = useState<Product | null>(null);
  const [stockFormData, setStockFormData] = useState({
    tipo: 'entrada' as 'entrada' | 'saida' | 'ajuste',
    quantidade: 1,
    motivo: '',
    observacao: ''
  });
  const [stockMovementsHistory, setStockMovementsHistory] = useState<any[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockSuccessMessage, setStockSuccessMessage] = useState<string | null>(null);
  const [stockErrorMessage, setStockErrorMessage] = useState<string | null>(null);

  const handleOpenStockModal = async (product: Product) => {
    setProductForStock(product);
    setStockFormData({
      tipo: 'entrada',
      quantidade: 1,
      motivo: '',
      observacao: ''
    });
    setStockSuccessMessage(null);
    setStockErrorMessage(null);
    setStockMovementsHistory([]);
    setIsStockModalOpen(true);

    if (restaurantId && product.id) {
      try {
        const history = await productService.getStockMovements(restaurantId, product.id);
        setStockMovementsHistory(history);
      } catch (err: any) {
        console.error("Error loading stock movements:", err);
      }
    }
  };

  const handleCloseStockModal = () => {
    setIsStockModalOpen(false);
    setProductForStock(null);
    setStockSuccessMessage(null);
    setStockErrorMessage(null);
  };

  const handleSubmitStockMovement = async () => {
    if (!restaurantId || !productForStock?.id) return;
    if (!stockFormData.motivo.trim()) {
      setStockErrorMessage("O motivo da movimentação é obrigatório.");
      return;
    }
    const qty = Number(stockFormData.quantidade);
    if (Number.isNaN(qty) || qty < 0) {
      setStockErrorMessage("Quantidade inválida.");
      return;
    }
    if (stockFormData.tipo !== 'ajuste' && qty === 0) {
      setStockErrorMessage("A quantidade deve ser maior que zero.");
      return;
    }

    setStockLoading(true);
    setStockErrorMessage(null);
    setStockSuccessMessage(null);

    try {
      const res = await productService.movimentarEstoque(restaurantId, productForStock.id, {
        tipo: stockFormData.tipo,
        quantidade: qty,
        motivo: stockFormData.motivo,
        observacao: stockFormData.observacao
      });

      setStockSuccessMessage(`Movimentação realizada com sucesso! Novo saldo: ${res.newStock} ${productForStock.unidadeMedida || 'un'}`);
      
      setProducts(prev => prev.map(p => p.id === productForStock.id ? { ...p, estoqueAtual: res.newStock, estoque: res.newStock, stock: res.newStock } : p));
      setProductForStock(prev => prev ? { ...prev, estoqueAtual: res.newStock, estoque: res.newStock, stock: res.newStock } : null);

      const history = await productService.getStockMovements(restaurantId, productForStock.id);
      setStockMovementsHistory(history);

      setTimeout(() => {
        setStockSuccessMessage(null);
      }, 4000);
    } catch (err: any) {
      setStockErrorMessage(err.message || 'Erro ao movimentar estoque.');
    } finally {
      setStockLoading(false);
    }
  };

  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    categoria_id: '',
    categoria_nome: '',
    imagem_url: '',
    preco: 0,
    min_extras: 0,
    max_extras: 0,
    status: 'ativo' as 'ativo' | 'inativo',
    exibir_adicionais: true,
    sizes: [] as { nome: string; preco: number; aceita_metade: boolean }[],
    optionGroups: [] as { groupId: string; nome: string; ordem: number; obrigatorio: boolean; min: number; max: number }[],
    salesChannels: { ...DEFAULT_PRODUCT_SALES_CHANNELS } as ProductSalesChannels,
    channelPricing: {} as ProductChannelPricing,
    controlarEstoque: false,
    estoqueAtual: 0,
    estoqueMinimo: 0,
    unidadeMedida: 'un',
    permitirVendaSemEstoque: false
  });

  useEffect(() => {
    if (adminRestaurantId) {
      setRestaurantId(adminRestaurantId);
      return;
    }
    const init = async () => {
      if (!user?.uid) return;
      
      try {
        const rid = profile?.restaurantId || (await restaurantService.getRestaurantByOwnerId(user.uid))?.id;
        if (rid) {
          setRestaurantId(rid);
        } else {
          setError("Restaurante não encontrado.");
          setLoading(false);
        }
      } catch (err) {
        console.error("Error initializing products:", err);
        setError("Erro ao identificar restaurante.");
        setLoading(false);
      }
    };
    init();
  }, [profile?.restaurantId, user?.uid, adminRestaurantId]);

  useEffect(() => {
    if (!restaurantId) return;

    const loadData = async () => {
      try {
        // Load categories
        const qCats = query(
          collection(db, 'restaurants', restaurantId, 'categories')
        );
        const catsSnapshot = await getDocs(qCats);
        const catsDocs = catsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const activeCats = catsDocs.filter((cat: any) => cat.status === 'ativo' || !cat.status);
        setCategories(activeCats);

        // Load sizes
        const qSizes = query(
          collection(db, 'restaurants', restaurantId, 'sizes'),
          orderBy('ordem', 'asc')
        );
        const sizesSnapshot = await getDocs(qSizes);
        const sizesDocs = sizesSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const activeSizes = sizesDocs.filter((size: any) => size.status === 'ativo' || !size.status);
        setSizes(activeSizes);

        // Load option groups
        const groups = await optionService.getGroups(restaurantId);
        setAvailableGroups(groups);

        // Load products
        const products = await productService.getProducts(restaurantId);
        setProducts(products as Product[]);
        setLoading(false);
      } catch (err) {
        console.error("Error loading product data:", err);
        setError("Erro ao carregar dados.");
        setLoading(false);
      }
    };
    loadData();
  }, [restaurantId]);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        nome: product.nome,
        descricao: product.descricao,
        categoria_id: product.categoria_id,
        categoria_nome: product.categoria_nome,
        imagem_url: product.imagem_url,
        preco: product.preco,
        min_extras: product.min_extras,
        max_extras: product.max_extras,
        status: product.status,
        exibir_adicionais: product.exibir_adicionais ?? true,
        sizes: product.sizes || [],
        optionGroups: product.optionGroups || [],
        salesChannels: normalizeProductSalesChannels(product),
        channelPricing: normalizeProductChannelPricing(product),
        controlarEstoque: product.controlarEstoque ?? product.stockControl ?? false,
        estoqueAtual: product.estoqueAtual ?? product.estoque ?? product.stock ?? 0,
        estoqueMinimo: product.estoqueMinimo ?? 0,
        unidadeMedida: product.unidadeMedida ?? 'un',
        permitirVendaSemEstoque: product.permitirVendaSemEstoque ?? false
      });
    } else {
      setEditingProduct(null);
      setFormData({
        nome: '',
        descricao: '',
        categoria_id: '',
        categoria_nome: '',
        imagem_url: '',
        preco: 0,
        min_extras: 0,
        max_extras: 0,
        status: 'ativo',
        exibir_adicionais: true,
        sizes: [],
        optionGroups: [],
        salesChannels: { ...DEFAULT_PRODUCT_SALES_CHANNELS },
        channelPricing: {
          delivery: undefined,
          counter: undefined,
          waiter: undefined
        },
        controlarEstoque: false,
        estoqueAtual: 0,
        estoqueMinimo: 0,
        unidadeMedida: 'un',
        permitirVendaSemEstoque: false
      });
    }
    setError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setFormData({
      nome: '',
      descricao: '',
      categoria_id: '',
      categoria_nome: '',
      imagem_url: '',
      preco: 0,
      min_extras: 0,
      max_extras: 0,
      status: 'ativo',
      exibir_adicionais: true,
      sizes: [],
      optionGroups: [],
      salesChannels: { ...DEFAULT_PRODUCT_SALES_CHANNELS },
      channelPricing: {
        delivery: undefined,
        counter: undefined,
        waiter: undefined
      },
      controlarEstoque: false,
      estoqueAtual: 0,
      estoqueMinimo: 0,
      unidadeMedida: 'un',
      permitirVendaSemEstoque: false
    });
  };

  const validateForm = () => {
    if (!formData.nome.trim()) return "Nome do produto é obrigatório.";
    if (!formData.categoria_id) return "Categoria é obrigatória.";
    if (formData.sizes.length === 0 && formData.preco <= 0) return "Preço deve ser maior que zero se nenhum tamanho for selecionado.";
    if (formData.sizes.length > 0 && formData.sizes.some(s => s.preco <= 0)) return "Preço do tamanho deve ser maior que zero.";
    if (formData.min_extras > formData.max_extras) return "Mínimo de adicionais não pode ser maior que o máximo.";

    if (formData.controlarEstoque) {
      if (formData.estoqueAtual < 0 || Number.isNaN(formData.estoqueAtual)) {
        return "A quantidade atual em estoque não pode ser negativa.";
      }
      if (formData.estoqueMinimo < 0 || Number.isNaN(formData.estoqueMinimo)) {
        return "O estoque mínimo não pode ser negativo.";
      }
      if (!formData.unidadeMedida?.trim()) {
        return "A unidade de medida é obrigatória quando o controle de estoque está ativado.";
      }
    }

    // Channel pricing validation
    const channels: ('delivery' | 'counter' | 'waiter')[] = ['delivery', 'counter', 'waiter'];
    for (const ch of channels) {
      const price = formData.channelPricing?.[ch];
      if (price !== undefined && price !== null && !Number.isNaN(price)) {
        if (price < 0) {
          return `O preço para o canal ${ch === 'delivery' ? 'Delivery' : ch === 'counter' ? 'Balcão' : 'Garçom'} não pode ser negativo.`;
        }
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!restaurantId) return;

    setSaveLoading(true);
    setError(null);

    try {
      // Find category name
      const category = categories.find(c => c.id === formData.categoria_id);
      
      // Clean up pricing to avoid undefined/null/NaN values on the firestore
      const channelPricing: ProductChannelPricing = {};
      const channels: ('delivery' | 'counter' | 'waiter')[] = ['delivery', 'counter', 'waiter'];
      for (const ch of channels) {
        const val = formData.channelPricing?.[ch];
        if (val !== undefined && val !== null && !Number.isNaN(val) && val >= 0) {
          channelPricing[ch] = val;
        }
      }

      const finalData = {
        ...formData,
        categoria_nome: category?.nome || '',
        preco: formData.sizes.length > 0 ? 0 : formData.preco,
        salesChannels: {
          delivery: !!formData.salesChannels.delivery,
          counter: !!formData.salesChannels.counter,
          waiter: !!formData.salesChannels.waiter
        },
        channelPricing,
        controlarEstoque: formData.controlarEstoque,
        estoqueAtual: formData.controlarEstoque ? Number(formData.estoqueAtual) || 0 : 0,
        estoqueMinimo: formData.controlarEstoque ? Number(formData.estoqueMinimo) || 0 : 0,
        unidadeMedida: formData.controlarEstoque ? formData.unidadeMedida : 'un',
        permitirVendaSemEstoque: formData.controlarEstoque ? formData.permitirVendaSemEstoque : false,
        estoque: formData.controlarEstoque ? Number(formData.estoqueAtual) || 0 : 0,
        stock: formData.controlarEstoque ? Number(formData.estoqueAtual) || 0 : 0
      };

      if (editingProduct?.id) {
        await productService.updateProduct(restaurantId, editingProduct.id, finalData);
        // Atualiza o estado local imediatamente
        setProducts(prev => prev.map(p => p.id === editingProduct.id ? { ...p, ...finalData } : p));
        setSuccessMessage("Produto atualizado com sucesso! Aguarde, ele será exibido em instantes.");
      } else {
        const newProductId = await productService.createProduct(restaurantId, finalData);
        // Atualiza o estado local imediatamente
        const newProduct = { id: newProductId, ...finalData } as Product;
        setProducts(prev => [newProduct, ...prev]);
        setSuccessMessage("Produto cadastrado com sucesso! Aguarde, ele será exibido em instantes.");
      }
      handleCloseModal();
      // Limpa a mensagem de sucesso após 5 segundos
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error("Error saving product:", err);
      setError("Erro ao salvar produto. Tente novamente.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!restaurantId || !productToDelete?.id) return;

    setSaveLoading(true);
    setError(null);
    try {
      await productService.deleteProduct(restaurantId, productToDelete.id);
      // Atualiza o estado local imediatamente
      setProducts(prev => prev.filter(p => p.id !== productToDelete.id));
      setSuccessMessage("Produto excluído com sucesso!");
      setIsDeleteModalOpen(false);
      setProductToDelete(null);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error("Error deleting product:", err);
      setError("Erro ao excluir produto.");
    } finally {
      setSaveLoading(false);
    }
  };

  const confirmDelete = (product: Product) => {
    setError(null);
    setProductToDelete(product);
    setIsDeleteModalOpen(true);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.descricao.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || p.categoria_id === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos"
        description="Gerencie os itens, preços e disponibilidade do seu cardápio."
        action={
          <Button
            onClick={() => handleOpenModal()}
            variant="primary"
            icon={<Plus className="w-5 h-5" />}
          >
            Adicionar produto
          </Button>
        }
      />

      {successMessage && (
        <InlineFeedback
          type="success"
          message={successMessage}
          className="animate-in fade-in slide-in-from-top-2"
        />
      )}

      {/* Products Table */}
      <DataTableContainer>
        <DataTableToolbar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por nome ou descrição..."
          filters={
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-[200px]">
                <Select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="all">Todas as Categorias</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nome}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          }
        />

        {loading ? (
          <DataTableSkeleton columns={5} rows={6} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead align="right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <DataTableEmptyState
                  icon={ImageIcon}
                  title="Nenhum produto encontrado"
                  description="Ajuste os termos de busca ou filtros de categoria."
                  colSpan={5}
                />
              ) : (
                (() => {
                  const groups: { category: any; items: any[] }[] = [];
                  categories.forEach((cat) => {
                    const items = filteredProducts.filter((p) => p.categoria_id === cat.id);
                    if (items.length > 0) {
                      groups.push({ category: cat, items });
                    }
                  });

                  const uncategorized = filteredProducts.filter(
                    (p) => !p.categoria_id || !categories.find((c) => c.id === p.categoria_id)
                  );
                  if (uncategorized.length > 0) {
                    groups.push({ category: { id: 'uncategorized', nome: 'Outros' }, items: uncategorized });
                  }

                  return groups.map((group) => (
                    <React.Fragment key={group.category.id}>
                      <TableRow isGroupHeader>
                        <TableCell colSpan={5} className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-1 h-3.5 rounded-full ${
                                group.category.id === 'uncategorized' ? 'bg-stone-300' : 'bg-emerald-500'
                              }`}
                            />
                            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                              {group.category.nome} <span className="ml-1 text-stone-400">({group.items.length})</span>
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {group.items.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-stone-100 rounded-xl overflow-hidden shrink-0 border border-stone-200">
                                <PlaceholderImage
                                  src={product.imagem_url}
                                  type="produto"
                                  className="w-full h-full object-cover"
                                  alt={product.nome}
                                >
                                </PlaceholderImage>
                              </div>
                              <div>
                                <p className="font-bold text-stone-800">{product.nome}</p>
                                <p className="text-xs text-stone-500 line-clamp-1 mb-1">{product.descricao}</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {normalizeProductSalesChannels(product).delivery && (
                                    <Badge variant="default" size="sm">
                                      Delivery
                                    </Badge>
                                  )}
                                  {normalizeProductSalesChannels(product).counter && (
                                    <Badge variant="neutral" size="sm">
                                      Balcão
                                    </Badge>
                                  )}
                                  {normalizeProductSalesChannels(product).waiter && (
                                    <Badge variant="neutral" size="sm">
                                      Garçom
                                    </Badge>
                                  )}
                                  {!normalizeProductSalesChannels(product).delivery &&
                                    !normalizeProductSalesChannels(product).counter &&
                                    !normalizeProductSalesChannels(product).waiter && (
                                      <Badge variant="warning" size="sm">
                                        Nenhum canal
                                      </Badge>
                                    )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="neutral">
                              {product.categoria_nome}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="font-bold text-stone-800">R$ {product.preco.toFixed(2)}</span>
                            {(product.controlarEstoque || product.stockControl) && (
                              <div className="text-xs text-stone-500 font-medium mt-0.5">
                                Estoque:{' '}
                                <span className="font-bold text-stone-700">
                                  {product.estoqueAtual ?? product.estoque ?? product.stock ?? 0}{' '}
                                  {product.unidadeMedida || 'un'}
                                </span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={product.status === 'ativo' ? 'success' : 'danger'}
                              size="sm"
                            >
                              {product.status === 'ativo' ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                          <TableCell align="right">
                            <div className="flex items-center justify-end gap-2">
                              {product.controlarEstoque || product.stockControl ? (
                                <IconButton
                                  onClick={() => handleOpenStockModal(product)}
                                  variant="ghost"
                                  size="sm"
                                  className="text-stone-400 hover:text-blue-600 hover:bg-blue-50"
                                  title="Movimentar Estoque"
                                  aria-label={`Movimentar estoque de ${product.nome}`}
                                >
                                  <ArrowRightLeft className="w-4 h-4" />
                                </IconButton>
                              ) : (
                                <IconButton
                                  onClick={() => handleOpenModal(product)}
                                  variant="ghost"
                                  size="sm"
                                  className="text-stone-300 hover:text-stone-500 hover:bg-stone-100"
                                  title="Ative o controle de estoque nas configurações do produto para movimentar"
                                  aria-label={`Editar produto ${product.nome}`}
                                >
                                  <ArrowRightLeft className="w-4 h-4 opacity-40" />
                                </IconButton>
                              )}
                              <IconButton
                                onClick={() => handleOpenModal(product)}
                                variant="ghost"
                                size="sm"
                                className="text-stone-400 hover:text-emerald-600 hover:bg-emerald-50"
                                title="Editar"
                                aria-label={`Editar ${product.nome}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </IconButton>
                              <IconButton
                                onClick={() => confirmDelete(product)}
                                variant="ghost"
                                size="sm"
                                className="text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                                title="Excluir"
                                aria-label={`Excluir ${product.nome}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </IconButton>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ));
                })()
              )}
            </TableBody>
          </Table>
        )}
      </DataTableContainer>

      {/* Modal Form */}
      <FormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingProduct ? 'Editar Produto' : 'Novo Produto'}
        subtitle="Preencha as informações do produto abaixo"
        icon={Settings2}
        maxWidth="3xl"
        error={error}
        footer={
          <div className="flex w-full items-center justify-end gap-3">
            <SecondaryButton type="button" onClick={handleCloseModal}>
              Cancelar
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              form="product-form"
              loading={saveLoading}
              disabled={saveLoading}
            >
              {editingProduct ? 'Salvar Produto' : 'Criar Produto'}
            </PrimaryButton>
          </div>
        }
      >
        <form id="product-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-6">
            <FormSection title="Informações Básicas">
              <FieldGroup cols={2}>
                <FormField label="Nome do Produto" required>
                  <TextInput
                    type="text"
                    required
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Ex: Pizza Calabresa G"
                  />
                </FormField>

                <FormField label="Categoria" required>
                  <SelectInput
                    required
                    value={formData.categoria_id}
                    onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
                  >
                    <option value="">Selecione uma categoria</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nome}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>

                <FormField label="Preço (R$)" required>
                  <TextInput
                    type="number"
                    step="0.01"
                    required
                    value={Number.isNaN(formData.preco) ? '' : formData.preco}
                    onChange={(e) => setFormData({ ...formData, preco: parseFloat(e.target.value) })}
                    placeholder="0,00"
                  />
                </FormField>

                <FormField label="Status" required>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => setFormData({ ...formData, status: 'ativo' })}
                      variant={formData.status === 'ativo' ? 'success' : 'secondary'}
                      className="flex-1 text-xs"
                    >
                      Ativo
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setFormData({ ...formData, status: 'inativo' })}
                      variant={formData.status === 'inativo' ? 'destructive' : 'secondary'}
                      className="flex-1 text-xs"
                    >
                      Inativo
                    </Button>
                  </div>
                </FormField>
              </FieldGroup>

              <div className="pt-2">
                <Checkbox
                  checked={formData.exibir_adicionais}
                  onChange={(checked) => setFormData({ ...formData, exibir_adicionais: checked })}
                  label="Exibir adicionais"
                  description="Permite que o cliente selecione opcionais cadastrados"
                />
              </div>
            </FormSection>

            <FormSection
              title="Canais de Venda"
              description="Escolha em quais canais de venda este produto estará disponível."
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80">
                  <Checkbox
                    checked={formData.salesChannels.delivery}
                    onChange={(checked) =>
                      setFormData({
                        ...formData,
                        salesChannels: { ...formData.salesChannels, delivery: checked },
                      })
                    }
                    label="Delivery no app"
                  />
                </div>

                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80">
                  <Checkbox
                    checked={formData.salesChannels.counter}
                    onChange={(checked) =>
                      setFormData({
                        ...formData,
                        salesChannels: { ...formData.salesChannels, counter: checked },
                      })
                    }
                    label="Venda no balcão"
                  />
                </div>

                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80">
                  <Checkbox
                    checked={formData.salesChannels.waiter}
                    onChange={(checked) =>
                      setFormData({
                        ...formData,
                        salesChannels: { ...formData.salesChannels, waiter: checked },
                      })
                    }
                    label="Garçom e mesas"
                  />
                </div>
              </div>

              {!formData.salesChannels.delivery && !formData.salesChannels.counter && !formData.salesChannels.waiter && (
                <InlineFeedback
                  type="warning"
                  message="Este produto não ficará disponível em nenhum canal de venda."
                />
              )}
            </FormSection>

            <FormSection
              title="Preços Específicos por Canal"
              description={`Deixe em branco para utilizar o preço padrão do produto (R$ ${
                Number.isNaN(formData.preco) ? '0,00' : formData.preco.toFixed(2)
              }).`}
            >
              <FieldGroup cols={3}>
                <FormField label="Preço no Delivery (R$)">
                  <TextInput
                    type="number"
                    step="0.01"
                    placeholder="Usar padrão"
                    disabled={!formData.salesChannels.delivery}
                    value={
                      formData.channelPricing.delivery === undefined ||
                      formData.channelPricing.delivery === null ||
                      Number.isNaN(formData.channelPricing.delivery)
                        ? ''
                        : formData.channelPricing.delivery
                    }
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setFormData({
                        ...formData,
                        channelPricing: {
                          ...formData.channelPricing,
                          delivery: Number.isNaN(val) ? undefined : val,
                        },
                      });
                    }}
                  />
                </FormField>

                <FormField label="Preço no Balcão (R$)">
                  <TextInput
                    type="number"
                    step="0.01"
                    placeholder="Usar padrão"
                    disabled={!formData.salesChannels.counter}
                    value={
                      formData.channelPricing.counter === undefined ||
                      formData.channelPricing.counter === null ||
                      Number.isNaN(formData.channelPricing.counter)
                        ? ''
                        : formData.channelPricing.counter
                    }
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setFormData({
                        ...formData,
                        channelPricing: {
                          ...formData.channelPricing,
                          counter: Number.isNaN(val) ? undefined : val,
                        },
                      });
                    }}
                  />
                </FormField>

                <FormField label="Preço no Garçom (R$)">
                  <TextInput
                    type="number"
                    step="0.01"
                    placeholder="Usar padrão"
                    disabled={!formData.salesChannels.waiter}
                    value={
                      formData.channelPricing.waiter === undefined ||
                      formData.channelPricing.waiter === null ||
                      Number.isNaN(formData.channelPricing.waiter)
                        ? ''
                        : formData.channelPricing.waiter
                    }
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setFormData({
                        ...formData,
                        channelPricing: {
                          ...formData.channelPricing,
                          waiter: Number.isNaN(val) ? undefined : val,
                        },
                      });
                    }}
                  />
                </FormField>
              </FieldGroup>
            </FormSection>

            <FormSection
              title="Controle de Estoque"
              description="Gerencie a quantidade e alertas de estoque deste produto."
            >
              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-200/80">
                <Switch
                  checked={formData.controlarEstoque}
                  onChange={(checked) => setFormData({ ...formData, controlarEstoque: checked })}
                  label="Controlar estoque"
                  description="Ativa o controle de baixas automáticas de estoque"
                />
              </div>

              {formData.controlarEstoque && (
                <div className="space-y-4 pt-2">
                  <FieldGroup cols={3}>
                    <FormField label="Quantidade Atual" required>
                      <TextInput
                        type="number"
                        step="any"
                        min="0"
                        required
                        value={Number.isNaN(formData.estoqueAtual) ? 0 : formData.estoqueAtual}
                        onChange={(e) =>
                          setFormData({ ...formData, estoqueAtual: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </FormField>

                    <FormField label="Estoque Mínimo">
                      <TextInput
                        type="number"
                        step="any"
                        min="0"
                        value={Number.isNaN(formData.estoqueMinimo) ? 0 : formData.estoqueMinimo}
                        onChange={(e) =>
                          setFormData({ ...formData, estoqueMinimo: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </FormField>

                    <FormField label="Unidade de Medida">
                      <SelectInput
                        value={formData.unidadeMedida}
                        onChange={(e) => setFormData({ ...formData, unidadeMedida: e.target.value })}
                      >
                        <option value="un">Unidade (un)</option>
                        <option value="kg">Quilo (kg)</option>
                        <option value="g">Grama (g)</option>
                        <option value="l">Litro (l)</option>
                        <option value="ml">Mililitro (ml)</option>
                        <option value="porção">Porção</option>
                        <option value="lata">Lata</option>
                        <option value="garrafa">Garrafa</option>
                        <option value="caixa">Caixa</option>
                      </SelectInput>
                    </FormField>
                  </FieldGroup>

                  <Checkbox
                    checked={formData.permitirVendaSemEstoque}
                    onChange={(checked) => setFormData({ ...formData, permitirVendaSemEstoque: checked })}
                    label="Permitir venda sem estoque"
                    description="Permite registrar pedidos even when the estoque zerar."
                  />
                </div>
              )}
            </FormSection>

            <FormSection
              title="Tamanhos"
              description="Defina os tamanhos e preços correspondentes para o produto."
            >
              <div className="space-y-2">
                {sizes.map((size) => {
                  const selectedSize = formData.sizes.find(s => s.nome === size.nome);
                  return (
                    <div key={size.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-stone-50 rounded-xl border border-stone-200/60">
                      <Checkbox
                        checked={!!selectedSize}
                        onChange={(checked) => {
                          if (checked) {
                            setFormData({ ...formData, sizes: [...formData.sizes, { nome: size.nome, preco: 0, aceita_metade: false }] });
                          } else {
                            setFormData({ ...formData, sizes: formData.sizes.filter(s => s.nome !== size.nome) });
                          }
                        }}
                        label={<span className="font-bold text-stone-700">{size.nome}</span>}
                      />
                      {selectedSize && (
                        <div className="flex items-center gap-3 pl-6 sm:pl-0">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Preço (R$)"
                            value={Number.isNaN(selectedSize.preco) ? '' : selectedSize.preco}
                            onChange={(e) => setFormData({
                              ...formData,
                              sizes: formData.sizes.map(s => s.nome === size.nome ? { ...s, preco: parseFloat(e.target.value) || 0 } : s)
                            })}
                            className="w-28 min-h-[36px] py-1.5 px-3 text-sm"
                          />
                          <Checkbox
                            checked={selectedSize.aceita_metade}
                            onChange={(checked) => setFormData({
                              ...formData,
                              sizes: formData.sizes.map(s => s.nome === size.nome ? { ...s, aceita_metade: checked } : s)
                            })}
                            label="Metade"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </FormSection>

            <FormSection title="Mídia e Descrição">
              <FieldGroup cols={2}>
                <ImageUpload
                  label="Imagem do Produto"
                  path={`restaurants/${restaurantId}/products`}
                  onUploadComplete={(url) => setFormData({ ...formData, imagem_url: url })}
                  currentImageUrl={formData.imagem_url}
                  processProductImage={true}
                />

                <FormField label="Descrição Breve">
                  <TextareaInput
                    rows={4}
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    placeholder="Descreva os ingredientes, tamanho, acompanhamentos, etc."
                  />
                </FormField>
              </FieldGroup>
            </FormSection>

            <FormSection
              title="Grupos de Opções"
              description="Associe grupos de adicionais ou opcionais a este produto."
            >
              <div className="space-y-3">
                {availableGroups.length === 0 ? (
                  <p className="text-sm text-stone-400 italic">Nenhum grupo de opções cadastrado.</p>
                ) : (
                  availableGroups.map(group => {
                    const selectedGroup = formData.optionGroups.find(g => g.groupId === group.id);
                    return (
                      <div key={group.id} className="p-4 bg-stone-50 rounded-2xl border border-stone-200/60 space-y-3">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={!!selectedGroup}
                            onChange={(checked) => {
                              if (checked) {
                                setFormData({
                                  ...formData,
                                  optionGroups: [...formData.optionGroups, {
                                    groupId: group.id!,
                                    nome: group.nome,
                                    ordem: group.ordem || 0,
                                    obrigatorio: false,
                                    min: 0,
                                    max: 1
                                  }]
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  optionGroups: formData.optionGroups.filter(g => g.groupId !== group.id)
                                });
                              }
                            }}
                            label={
                              <div className="flex flex-col">
                                <span className="font-bold text-stone-700">{group.nome}</span>
                                {group.descricao && <span className="text-xs text-stone-500 font-medium">{group.descricao}</span>}
                              </div>
                            }
                          />
                        </div>

                        {selectedGroup && (
                          <div className="pl-6.5 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in slide-in-from-left-2">
                            <Checkbox
                              checked={selectedGroup.obrigatorio}
                              onChange={(checked) => setFormData({
                                ...formData,
                                optionGroups: formData.optionGroups.map(g => g.groupId === group.id ? { ...g, obrigatorio: checked } : g)
                              })}
                              label="Obrigatório"
                            />
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Min</span>
                              <Input
                                type="number"
                                min="0"
                                value={selectedGroup.min}
                                onChange={(e) => setFormData({
                                  ...formData,
                                  optionGroups: formData.optionGroups.map(g => g.groupId === group.id ? { ...g, min: parseInt(e.target.value) || 0 } : g)
                                })}
                                className="w-full min-h-[36px] py-1.5 px-3 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">Max</span>
                              <Input
                                type="number"
                                min="1"
                                value={selectedGroup.max}
                                onChange={(e) => setFormData({
                                  ...formData,
                                  optionGroups: formData.optionGroups.map(g => g.groupId === group.id ? { ...g, max: parseInt(e.target.value) || 1 } : g)
                                })}
                                className="w-full min-h-[36px] py-1.5 px-3 text-xs"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </FormSection>

            <FormSection
              title="Limites de Adicionais"
              description="Defina quantos adicionais o cliente pode/deve escolher para este produto."
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Mínimo">
                  <TextInput
                    type="number"
                    min="0"
                    value={Number.isNaN(formData.min_extras) ? '' : formData.min_extras}
                    onChange={e => setFormData({ ...formData, min_extras: parseInt(e.target.value) })}
                  />
                </FormField>
                <FormField label="Máximo">
                  <TextInput
                    type="number"
                    min="0"
                    value={Number.isNaN(formData.max_extras) ? '' : formData.max_extras}
                    onChange={e => setFormData({ ...formData, max_extras: parseInt(e.target.value) })}
                  />
                </FormField>
              </div>
            </FormSection>
          </div>
        </form>
      </FormModal>
      {/* Modal de Movimentação de Estoque */}
      <FormModal
        isOpen={isStockModalOpen}
        onClose={handleCloseStockModal}
        title={`Movimentar Estoque: ${productForStock?.nome || ''}`}
        subtitle="Registre entradas, saídas ou ajuste o saldo de estoque"
        icon={ArrowRightLeft}
        iconBgColor="bg-blue-50"
        iconTextColor="text-blue-600"
        maxWidth="2xl"
        footer={
          <div className="flex w-full items-center justify-end gap-3">
            <SecondaryButton type="button" onClick={handleCloseStockModal}>
              Cancelar
            </SecondaryButton>
            <PrimaryButton
              type="button"
              disabled={stockLoading}
              onClick={handleSubmitStockMovement}
              loading={stockLoading}
            >
              Confirmar Movimentação
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-6 py-2">
          {stockErrorMessage && (
            <InlineFeedback
              type="error"
              message={stockErrorMessage}
            />
          )}
          {stockSuccessMessage && (
            <InlineFeedback
              type="success"
              message={stockSuccessMessage}
            />
          )}

          <div className="bg-stone-50 border border-stone-200/60 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs text-stone-500 font-medium uppercase tracking-wider">Saldo Atual em Estoque</p>
              <p className="text-2xl font-black text-stone-800 mt-0.5">
                {productForStock?.estoqueAtual ?? productForStock?.estoque ?? productForStock?.stock ?? 0} <span className="text-sm font-bold text-stone-500">{productForStock?.unidadeMedida || 'un'}</span>
              </p>
            </div>
            {productForStock?.permitirVendaSemEstoque && (
              <Badge variant="warning">
                Permite Venda Sem Estoque
              </Badge>
            )}
          </div>

          <FieldGroup cols={2}>
            <FormField label="Tipo de Movimentação">
              <SelectInput
                value={stockFormData.tipo}
                onChange={e => setStockFormData({ ...stockFormData, tipo: e.target.value as any })}
              >
                <option value="entrada">Entrada (+)</option>
                <option value="saida">Saída (-)</option>
                <option value="ajuste">Ajuste de Saldo (Definir)</option>
              </SelectInput>
            </FormField>

            <FormField label={stockFormData.tipo === 'ajuste' ? 'Novo Saldo (Ajuste)' : 'Quantidade'}>
              <TextInput
                type="number"
                step="any"
                min="0"
                value={Number.isNaN(stockFormData.quantidade) ? '' : stockFormData.quantidade}
                onChange={e => setStockFormData({ ...stockFormData, quantidade: parseFloat(e.target.value) || 0 })}
                placeholder="Ex: 10"
              />
            </FormField>
          </FieldGroup>

          {(() => {
            const current = productForStock?.estoqueAtual ?? productForStock?.estoque ?? productForStock?.stock ?? 0;
            const qty = Number(stockFormData.quantidade) || 0;
            let resulting = current;
            if (stockFormData.tipo === 'entrada') resulting = current + qty;
            else if (stockFormData.tipo === 'saida') resulting = current - qty;
            else if (stockFormData.tipo === 'ajuste') resulting = qty;

            const isNegative = resulting < 0;
            const allowWithoutStock = productForStock?.permitirVendaSemEstoque;

            return (
              <div className={`p-4 rounded-2xl border ${isNegative && !allowWithoutStock ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50/50 border-emerald-200 text-stone-800'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-600">Saldo Resultante Previsto:</span>
                  <span className={`text-xl font-black ${isNegative && !allowWithoutStock ? 'text-red-600' : 'text-emerald-700'}`}>
                    {resulting} {productForStock?.unidadeMedida || 'un'}
                  </span>
                </div>
                {isNegative && !allowWithoutStock && (
                  <p className="text-xs text-red-600 mt-1 font-semibold">
                    ⚠️ Atenção: O saldo resultante não pode ser negativo pois a venda sem estoque está desativada.
                  </p>
                )}
              </div>
            );
          })()}

          <FieldGroup cols={1}>
            <FormField label="Motivo da Movimentação" required>
              <SelectInput
                value={stockFormData.motivo}
                onChange={e => setStockFormData({ ...stockFormData, motivo: e.target.value })}
                className="mb-2"
              >
                <option value="">Selecione um motivo...</option>
                <option value="Reposição de Estoque">Reposição de Estoque</option>
                <option value="Compra / Entrada de Fornecedor">Compra / Entrada de Fornecedor</option>
                <option value="Perda / Avaria / Descarte">Perda / Avaria / Descarte</option>
                <option value="Contagem de Inventário (Balanço)">Contagem de Inventário (Balanço)</option>
                <option value="Ajuste de Saldo Manual">Ajuste de Saldo Manual</option>
                <option value="Outro">Outro</option>
              </SelectInput>
              <TextInput
                type="text"
                placeholder="Ou digite outro motivo..."
                value={stockFormData.motivo}
                onChange={e => setStockFormData({ ...stockFormData, motivo: e.target.value })}
              />
            </FormField>
          </FieldGroup>

          <FieldGroup cols={1}>
            <FormField label="Observação (Opcional)">
              <TextareaInput
                rows={2}
                value={stockFormData.observacao}
                onChange={e => setStockFormData({ ...stockFormData, observacao: e.target.value })}
                placeholder="Detalhes adicionais sobre a movimentação..."
              />
            </FormField>
          </FieldGroup>

          <div className="pt-4 border-t border-stone-200">
            <h4 className="font-bold text-stone-800 text-sm mb-3 flex items-center gap-2">
              <History className="w-4 h-4 text-stone-500" />
              Histórico Recente de Movimentações
            </h4>
            {stockMovementsHistory.length === 0 ? (
              <p className="text-xs text-stone-400 italic">Nenhuma movimentação registrada ainda.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {stockMovementsHistory.map((mov: any) => (
                  <div key={mov.id} className="p-2.5 bg-stone-50 border border-stone-100 rounded-xl text-xs flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${
                          mov.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700' :
                          mov.tipo === 'saida' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {mov.tipo}
                        </span>
                        <span className="font-bold text-stone-800">
                          {mov.tipo === 'ajuste' ? `Novo saldo: ${mov.quantidade}` : `${mov.tipo === 'entrada' ? '+' : '-'}${mov.quantidade}`}
                        </span>
                        <span className="text-stone-500">• {mov.motivo}</span>
                      </div>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        {mov.usuario} em {new Date(mov.created_at).toLocaleString('pt-BR')} {mov.observacao ? `(${mov.observacao})` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-stone-400 block">Saldo</span>
                      <span className="font-bold text-stone-700">{mov.quantidadeAnterior} → {mov.quantidadeNova}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </FormModal>

      {/* Modal de Exclusão */}
      <ConfirmDialog
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setProductToDelete(null);
        }}
        onConfirm={handleDelete}
        title="Excluir Produto"
        description={`Tem certeza que deseja excluir o produto ${productToDelete?.nome || ''}?`}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        type="danger"
        loading={saveLoading}
      />
    </div>
  );
}
