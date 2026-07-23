import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAgentDto } from './dto/create-agent.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateAgentDto) {
    return this.prisma.agent.create({
      data: {
        userId,
        name: dto.name,
        systemPrompt: dto.systemPrompt ?? '',
        model: dto.model ?? 'gemini-2.5-flash',
        graph: dto.graph as any,
        tools: (dto.tools ?? []) as any,
        fileIds: dto.fileIds ?? [],
      },
    });
  }

  findAll(userId: string) {
    return this.prisma.agent.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
  }

  // Каждый запрос фильтруется по userId — чужого агента не увидеть и не удалить
  remove(userId: string, id: string) {
    return this.prisma.agent.deleteMany({ where: { id, userId } });
  }
}
