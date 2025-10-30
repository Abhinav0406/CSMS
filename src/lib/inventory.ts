export type Location = 'Liberty' | 'Warehouse A' | 'Warehouse B';

export interface Product {
  sku: string;
  name: string;
  handle?: string;
  smallImageUrl?: string;
  fullImageUrl?: string;
  location: Location;
  onHandCurrent: number;
  onHandNew: number; // editable for Edit role
  committed: number; // read-only
  returns: number; // total returns count
  incoming?: number; // optional incoming quantity
  unavailable?: number; // optional not editable in source
  // Preserve all original CSV columns for round-trip export
  rawHeaders?: string[]; // header order as imported
  rawRow?: Record<string, string>; // column -> cell value
}

export type ReturnStatus = 'restocked' | 'not_restocked' | 'in_transit';

export function computeAvailable(onHand: number, committed: number): number {
  return onHand - committed;
}

export function computeTotal(onHand: number, committed: number, returns: number): number {
  return onHand + returns - committed;
}

export function handleOrderPlaced(p: Product, quantity: number): Product {
  const committed = Math.max(0, p.committed + quantity);
  return { ...p, committed };
}

export function handleOrderFulfilled(p: Product, quantity: number): Product {
  const onHandCurrent = Math.max(0, p.onHandCurrent - quantity);
  const committed = Math.max(0, p.committed - quantity);
  return { ...p, onHandCurrent, committed };
}

export function handleReturn(p: Product, quantity: number, status: ReturnStatus): Product {
  if (status === 'restocked') {
    const onHandCurrent = p.onHandCurrent + quantity;
    const returns = Math.max(0, p.returns - quantity);
    return { ...p, onHandCurrent, returns };
  }
  if (status === 'not_restocked') {
    return p; // no change
  }
  // in_transit: pending update, increment returns as pending
  return { ...p, returns: p.returns + quantity };
}

// No default sample data; rows are provided by import or backend
export const sampleProducts: Product[] = [];


