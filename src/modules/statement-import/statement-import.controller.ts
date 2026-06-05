import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { StatementImportService } from './statement-import.service';
import { UpdateImportRowsDto } from './dto/update-import-rows.dto';
import { ConfirmImportDto } from './dto/confirm-import.dto';

@Controller('statement-imports')
@UseGuards(JwtAuthGuard)
export class StatementImportController {
  constructor(private readonly service: StatementImportService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('accountId') accountId: string,
    @CurrentUser() user: User,
  ) {
    return this.service.uploadAndParse(user.id, accountId, file);
  }

  @Get(':id')
  getPreview(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.getPreview(id, user.id);
  }

  @Patch(':id/rows')
  updateRows(
    @Param('id') id: string,
    @Body() dto: UpdateImportRowsDto,
    @CurrentUser() user: User,
  ) {
    return this.service.updateRows(id, user.id, dto);
  }

  @Post(':id/confirm')
  confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmImportDto,
    @CurrentUser() user: User,
  ) {
    return this.service.confirm(id, user.id, dto);
  }

  @Delete(':id')
  cancel(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.cancel(id, user.id);
  }
}
