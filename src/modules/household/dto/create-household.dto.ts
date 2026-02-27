import { IsString, MaxLength } from 'class-validator';

export class CreateHouseholdDto {
  @IsString()
  @MaxLength(255)
  name: string;
}
