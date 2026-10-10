import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  principalId!: string;

  @IsIn(['user', 'agent'])
  principalType!: 'user' | 'agent';

  @IsOptional()
  @IsString()
  label?: string;
}
