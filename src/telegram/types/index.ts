export interface DeliveryState {
  type: 'cargo' | 'white';
  weight?: number;
  volume?: number;
  price?: number;
  description?: string;
  volumePerUnit?: number;
  count?: number;
  step: 'type' | 'weight' | 'volumePerUnit' | 'count' | 'volume' | 'price' | 'description' | 'complete';
} 