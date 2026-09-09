import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConnectorsController, ConnectorsOAuthController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';

// ==========================================
// ConnectorsModule (#3) — реальные интеграции внешних сервисов
// ==========================================
// ConnectorsOAuthController намеренно без JwtAuthGuard (принимает редирект
// OAuth от GitHub/Notion, авторизация — в подписанном state). Сервис
// экспортируется, чтобы им пользовались агенты/звонки для получения токенов.
@Module({
  imports: [PrismaModule],
  controllers: [ConnectorsController, ConnectorsOAuthController],
  providers: [ConnectorsService],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
