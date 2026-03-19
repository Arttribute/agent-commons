export class CreateApiKeyDto {
  principalId!: string;
  principalType!: 'user' | 'agent';
  label?: string;
}
