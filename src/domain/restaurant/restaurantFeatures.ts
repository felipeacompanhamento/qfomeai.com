export interface RestaurantFeatures {
  counterEnabled: boolean;
  waiterEnabled: boolean;
  tablesEnabled: boolean;
  tableQrEnabled: boolean;
  kioskEnabled: boolean;
}

export const DEFAULT_RESTAURANT_FEATURES: RestaurantFeatures = {
  counterEnabled: false,
  waiterEnabled: false,
  tablesEnabled: false,
  tableQrEnabled: false,
  kioskEnabled: false
};

export function normalizeRestaurantFeatures(restaurant: any): RestaurantFeatures {
  if (!restaurant) {
    return { ...DEFAULT_RESTAURANT_FEATURES };
  }

  const features = restaurant.features || {};

  return {
    counterEnabled: typeof features.counterEnabled === 'boolean' ? features.counterEnabled : false,
    waiterEnabled: typeof features.waiterEnabled === 'boolean' ? features.waiterEnabled : false,
    tablesEnabled: typeof features.tablesEnabled === 'boolean' ? features.tablesEnabled : false,
    tableQrEnabled: typeof features.tableQrEnabled === 'boolean' ? features.tableQrEnabled : false,
    kioskEnabled: typeof features.kioskEnabled === 'boolean' ? features.kioskEnabled : false
  };
}
