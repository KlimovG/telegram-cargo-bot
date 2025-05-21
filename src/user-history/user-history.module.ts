import { Module } from '@nestjs/common';
import { UserHistoryService } from './user-history.service';

@Module({
  providers: [UserHistoryService]
})
export class UserHistoryModule {}
