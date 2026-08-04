import { Module } from '@nestjs/common';
import { WebFetchController } from './webfetch.controller';
import { WebFetchService } from './webfetch.service';

@Module({
  controllers: [WebFetchController],
  providers: [WebFetchService],
})
export class WebFetchModule {}
