import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SimulatePrepaymentDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  extraPerMonthMinor: number;
}
