import { Injectable } from '@nestjs/common';
import { DeliveryState } from './types';

@Injectable()
export class StateService {
  private userStates: Map<string, DeliveryState> = new Map();

  setState(userId: string, state: DeliveryState) {
    this.userStates.set(userId, state);
  }

  getState(userId: string): DeliveryState | undefined {
    return this.userStates.get(userId);
  }

  clearState(userId: string) {
    this.userStates.delete(userId);
  }
} 