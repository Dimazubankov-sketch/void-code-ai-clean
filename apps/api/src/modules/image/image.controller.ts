import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ImageService } from './image.service';

class GenerateImageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt!: string;
}

@Controller('images')
@UseGuards(JwtAuthGuard)
export class ImageController {
  constructor(private readonly image: ImageService) {}

  @Post('generate')
  async generate(@Body() dto: GenerateImageDto) {
    const url = await this.image.generate(dto.prompt);
    return { url };
  }
}
