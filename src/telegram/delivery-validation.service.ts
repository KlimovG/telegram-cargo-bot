import { Injectable } from '@nestjs/common';
import { DeliveryValidationResult } from './types';

@Injectable()
export class DeliveryValidationService {
    async validateWeight(text: string): Promise<DeliveryValidationResult> {
        let weightStr = text.replace(/\s+/g, '').replace(',', '.');
        weightStr = weightStr.replace(/[^\d.]/g, '');
        const weight = parseFloat(weightStr);
        if (isNaN(weight) || weight <= 0) {
            return { valid: false, error: 'Пожалуйста, введите корректный вес (число больше 0, например: 12.5):' };
        }
        return { valid: true, value: weight };
    }

    async validateVolumePerUnit(text: string): Promise<DeliveryValidationResult> {
        let vpuStr = text.replace(/\s+/g, '').replace(',', '.');
        vpuStr = vpuStr.replace(/[^\d.]/g, '');
        const volumePerUnit = parseFloat(vpuStr);
        if (isNaN(volumePerUnit) || volumePerUnit <= 0) {
            return { valid: false, error: 'Пожалуйста, введите корректный объем единицы товара (например: 0.15):' };
        }
        return { valid: true, value: volumePerUnit };
    }

    async validateCount(text: string): Promise<DeliveryValidationResult> {
        let countStr = text.replace(/\s+/g, '');
        countStr = countStr.replace(/[^\d]/g, '');
        const count = parseInt(countStr, 10);
        if (isNaN(count) || count <= 0) {
            return { valid: false, error: 'Пожалуйста, введите корректное количество (целое число больше 0):' };
        }
        return { valid: true, value: count };
    }

    async validatePrice(text: string): Promise<DeliveryValidationResult> {
        let priceStr = text.replace(/\s+/g, '').replace(',', '.');
        priceStr = priceStr.replace(/[^\d.]/g, '');
        const price = parseFloat(priceStr);
        if (isNaN(price) || price <= 0) {
            return { valid: false, error: 'Пожалуйста, введите корректную стоимость (число больше 0, например: 1500):' };
        }
        return { valid: true, value: price };
    }
} 