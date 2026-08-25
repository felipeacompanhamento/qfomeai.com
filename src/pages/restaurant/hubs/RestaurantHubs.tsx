import React from 'react';
import { ModuleHub } from '../../../components/navigation/ModuleHub';
import { RESTAURANT_HUBS } from '../../../config/restaurantHubs';

// Import existing page components
import RestaurantOrdersPage from '../orders/RestaurantOrdersPage';
import CounterPage from '../Counter';
import MesasComandasHubPage from './MesasComandasHubPage';
import CozinhaPage from './CozinhaPage';
import EntregasHubPage from './EntregasHubPage';

import RestaurantProducts from '../Products';
import RestaurantCategories from '../Categories';
import RestaurantSizes from '../Sizes';
import RestaurantExtras from '../Extras';
import OptionGroups from '../OptionGroups';
import Promotions from '../Promotions';
import StockPage from './StockPage';

import ClientesPage from './ClientesPage';
import TeamSettings from '../settings/TeamSettings';
import PerformanceDashboard from '../PerformanceDashboard';

import FinanceiroHubPage from './FinanceiroHubPage';
import ConfiguracoesHubPage from './ConfiguracoesHubPage';

import AccountSettings from '../AccountSettings';
import Schedules from '../Schedules';
import DeliveryAreas from '../DeliveryAreas';
import RestaurantPayments from '../Payments';
import PrintSettings from '../PrintSettings';
import MercadoPagoIntegration from '../Integration';
import WhatsAppIntegration from '../WhatsAppIntegration';
import PasswordSettings from '../PasswordSettings';

interface HubProps {
  restaurantProfile?: any;
  orders?: any[];
  setOrders?: any;
  handleUpdateStatus?: any;
  fetchOrders?: any;
  isRefreshing?: boolean;
  isLoadingMore?: boolean;
  updatingOrderId?: string | null;
  fetchMoreOrders?: any;
  hasMore?: boolean;
}

export const OperacaoHubWrapper: React.FC<HubProps> = ({
  restaurantProfile,
  orders = [],
  setOrders,
  handleUpdateStatus,
  fetchOrders,
  isRefreshing = false,
  isLoadingMore = false,
  updatingOrderId = null,
  fetchMoreOrders,
  hasMore = false,
}) => {
  const tabComponents: Record<string, React.ReactNode> = {
    pedidos: (
      <RestaurantOrdersPage
        orders={orders}
        setOrders={setOrders}
        onUpdate={handleUpdateStatus}
        restaurantProfile={restaurantProfile}
        onRefresh={() => fetchOrders && fetchOrders(false, true)}
        isRefreshing={isRefreshing}
        isLoadingMore={isLoadingMore}
        updatingOrderId={updatingOrderId}
        onLoadMore={fetchMoreOrders}
        hasMore={hasMore}
      />
    ),
    balcao: <CounterPage restaurantProfile={restaurantProfile} />,
    mesas: <MesasComandasHubPage />,
    cozinha: (
      <CozinhaPage
        orders={orders}
        onUpdateStatus={handleUpdateStatus}
        onRefresh={() => fetchOrders && fetchOrders(false, true)}
        isRefreshing={isRefreshing}
      />
    ),
    entregas: <EntregasHubPage />,
  };

  return <ModuleHub hub={RESTAURANT_HUBS.operacao} restaurantProfile={restaurantProfile} tabComponents={tabComponents} />;
};

import CardapioHubPage from './CardapioHubPage';

export const CardapioHubWrapper: React.FC<HubProps> = () => {
  return <CardapioHubPage />;
};

import GestaoHubPage from './GestaoHubPage';
export const GestaoHubWrapper: React.FC<HubProps> = ({ restaurantProfile, orders = [] }) => {
  return <GestaoHubPage restaurantProfile={restaurantProfile} orders={orders} />;
};

export const FinanceiroHubWrapper: React.FC<HubProps> = () => {
  return <FinanceiroHubPage />;
};

export const ConfiguracoesHubWrapper: React.FC<HubProps> = () => {
  return <ConfiguracoesHubPage />;
};
