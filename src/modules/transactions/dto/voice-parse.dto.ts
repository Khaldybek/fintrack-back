import { IsString } from 'class-validator';

export class VoiceParseDto {
  @IsString()
  text: string;
}
