import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';

@Controller('agents')
@UseGuards(JwtAuthGuard)
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateAgentDto) {
    return this.agents.create(req.user.userId, dto);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.agents.findAll(req.user.userId);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.agents.remove(req.user.userId, id);
  }
}
