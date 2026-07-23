import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ChatModule } from './modules/chat/chat.module';
import { BillingModule } from './modules/billing/billing.module';
import { AgentsModule } from './modules/agents/agents.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ChatModule,
    BillingModule,
    AgentsModule,
  ],
})
export class AppModule {}
