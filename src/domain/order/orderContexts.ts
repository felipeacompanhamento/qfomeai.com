export interface OrderTableContext {
  tableId: string;
  tableName: string;
  serviceAreaId: string;
  sessionId: string;
  guestCount: number;
  waiterId?: string;
  waiterName?: string;
}

export interface OrderCounterContext {
  terminalId?: string;
  operatorId: string;
  operatorName: string;
}
