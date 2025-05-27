export interface DeliveryState {
  type: DeliveryType;
  weight?: number;
  volume?: number;
  price?: number;
  description?: string;
  volumePerUnit?: number;
  count?: number;
  step: DeliveryStep;
}

export type DeliveryStep = 'type' | 'weight' | 'volumePerUnit' | 'count' | 'volume' | 'price' | 'description' | 'complete';

export type DeliveryType = 'cargo' | 'white';

export interface DeliveryStepResult {
  valid: boolean;
  nextStep?: DeliveryStep;
  message: string;
  newState?: DeliveryState;
  complete?: boolean;
}

export interface DeliveryStepHandleData {
  step: DeliveryStep,
  text: string,
  state: DeliveryState
}
