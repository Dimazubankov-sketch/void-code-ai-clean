import { Body, Controller, Get, Post, Req, UseGuards, Delete, Param, BadRequestException } from '@nestjs/common';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

// ==========================================
// Планировщик задач (заглушка, in-memory)
// ==========================================
// Пользователь из UI оркестратора создаёт задачу с описанием, временем
// старта и периодичностью. Здесь мы принимаем payload, сохраняем в
// оперативной памяти и возвращаем клиенту. Настоящий scheduler (BullMQ /
// node-cron) — задача следующей итерации; для проверки UI и API-контракта
// хватает in-memory Map с TTL «до перезапуска».
//
// Замечания:
// - Пока хранение в памяти — при рестарте PM2 всё очистится (это ok для
//   первого демо и не даёт ложного ощущения persistence).
// - Ограничение: 50 активных задач на пользователя, чтобы кто-то случайно
//   не забил очередь.
// - Валидация периодичности — фиксированный enum, дальнейший scheduler
//   опирается на строгий набор значений.

export class ScheduleTaskDto {
  @IsString()
  @IsOptional()
  agentId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @IsOptional()
  @MaxLength(800)
  description?: string;

  @IsISO8601()
  startAt!: string;

  @IsString()
  @IsIn(['once', 'daily', 'weekly', 'monthly'])
  period!: string;
}

interface ScheduledTask {
  id: string;
  userId: string;
  agentId?: string;
  title: string;
  description: string;
  startAt: string;
  period: string;
  createdAt: string;
  status: 'queued' | 'running' | 'done' | 'failed';
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  // Простое in-memory хранилище. Ключ = userId, значение = массив задач.
  // Не претендует на кластерное поведение — на текущем этапе достаточно.
  private static store = new Map<string, ScheduledTask[]>();

  @Post('schedule')
  async schedule(@Req() req: any, @Body() dto: ScheduleTaskDto) {
    const userId = req.user.userId as string;
    const list = TasksController.store.get(userId) || [];
    if (list.length >= 50) {
      throw new BadRequestException('Достигнут лимит запланированных задач (50). Удалите старые.');
    }
    const startAt = new Date(dto.startAt);
    if (Number.isNaN(startAt.getTime())) {
      throw new BadRequestException('Некорректная дата старта');
    }
    const task: ScheduledTask = {
      id: `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      agentId: dto.agentId,
      title: dto.title.trim(),
      description: (dto.description || '').trim(),
      startAt: startAt.toISOString(),
      period: dto.period,
      createdAt: new Date().toISOString(),
      status: 'queued',
    };
    list.push(task);
    TasksController.store.set(userId, list);
    console.log(`[TasksController] schedule userId=${userId} title="${task.title}" startAt=${task.startAt} period=${task.period}`);
    return task;
  }

  @Get('list')
  async list(@Req() req: any) {
    const userId = req.user.userId as string;
    return TasksController.store.get(userId) || [];
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId as string;
    const list = TasksController.store.get(userId) || [];
    const filtered = list.filter((t) => t.id !== id);
    TasksController.store.set(userId, filtered);
    return { removed: list.length - filtered.length };
  }
}
