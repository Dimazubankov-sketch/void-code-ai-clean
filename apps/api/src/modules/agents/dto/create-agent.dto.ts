import { IsArray, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(20000)
  systemPrompt?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsObject()
  graph!: Record<string, unknown>; // nodes + edges из канваса

  @IsArray()
  @IsOptional()
  tools?: unknown[];

  @IsArray()
  @IsOptional()
  fileIds?: string[];
}
