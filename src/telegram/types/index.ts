export interface DeliveryState {
  type: 'cargo' | 'white';
  weight?: number;
  volume?: number;
  price?: number;
  description?: string;
  step: 'type' | 'weight' | 'volume' | 'price' | 'description' | 'complete';
} 