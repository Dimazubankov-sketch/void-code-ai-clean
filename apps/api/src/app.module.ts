import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ChatModule } from './modules/chat/chat.module';
import { ImageModule } from './modules/image/image.module';
import { TtsModule } from './modules/tts/tts.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { WebFetchModule } from './modules/webfetch/webfetch.module';
import { BillingModule } from './modules/billing/billing.module';
import { AgentsModule } from './modules/agents/agents.module';
import { SupportModule } from './modules/support/support.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ChatModule,
    ImageModule,
    TtsModule,
    TasksModule,
    WebFetchModule,
    BillingModule,
    AgentsModule,
    SupportModule,
  ],
})
export class AppModule {}
