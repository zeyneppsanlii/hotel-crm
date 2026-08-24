import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { PERMISSIONS } from '../auth/permissions';
import { toUserId } from './types/user.types';

// Authenticated by the global JwtAuthGuard; managing users needs users:manage
// (held by admin/manager). Everything is tenant-scoped via RLS.
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findPage(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(toUserId(id));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.update(toUserId(id), dto, toUserId(actor.userId));
  }
}
