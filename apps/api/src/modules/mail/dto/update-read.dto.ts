import { IsBoolean } from 'class-validator';

export class UpdateReadDto {
  @IsBoolean()
  isRead!: boolean;
}
