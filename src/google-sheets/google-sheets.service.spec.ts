import { Test, TestingModule } from '@nestjs/testing';
import { GoogleSheetsService } from './google-sheets.service';

describe('GoogleSheetsService', () => {
  let service: GoogleSheetsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GoogleSheetsService],
    }).compile();

    service = module.get<GoogleSheetsService>(GoogleSheetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should calculate delivery cost', async () => {
    const result = await service.calculateDelivery({
      type: 'cargo',
      weight: 10,
      volume: 0.1,
      price: 1000,
      description: 'Test cargo'
    });

    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });
});
