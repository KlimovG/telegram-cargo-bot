import { Injectable } from '@nestjs/common';
import { DeliveryState } from './types';

@Injectable()
export class StateService {
  private userStates: Map<string, DeliveryState> = new Map();
  private userBotMessages: Map<string, number[]> = new Map();

  setState(userId: string, state: DeliveryState) {
    this.userStates.set(userId, state);
  }

  getState(userId: string): DeliveryState | undefined {
    return this.userStates.get(userId);
  }

  clearState(userId: string) {
    this.userStates.delete(userId);
  }

  addBotMessage(userId: string, messageId: number) {
    if (!this.userBotMessages.has(userId)) {
      this.userBotMessages.set(userId, []);
    }
    this.userBotMessages.get(userId)!.push(messageId);
  }

  getAndClearBotMessages(userId: string): number[] {
    const ids = this.userBotMessages.get(userId) || [];
    this.userBotMessages.set(userId, []);
    return ids;
  }
} 