import { IsUUID } from 'class-validator';

export class UploadStatementDto {
  @IsUUID()
  accountId: string;
}
