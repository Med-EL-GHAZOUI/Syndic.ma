import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Perm } from '../common/auth-user';
import { BuildingDto, EndOccupancyDto, ResidenceDto, ResidentDto, ResidentQuery, UnitDto, UnitQuery } from './properties.dto';
import { PropertiesService } from './properties.service';

const uuid = new ParseUUIDPipe();

@ApiTags('properties')
@ApiBearerAuth()
@Controller()
export class PropertiesController {
  constructor(private readonly svc: PropertiesService) {}

  @Perm('residences', 'v') @Get('residences')
  listResidences(@CurrentUser() u: AuthUser) { return this.svc.listResidences(u); }

  @Perm('residences', 'v') @Get('residences/:id')
  getResidence(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.getResidence(u, id); }

  @Perm('residences', 'c') @Post('residences')
  createResidence(@CurrentUser() u: AuthUser, @Body() dto: ResidenceDto) { return this.svc.createResidence(u, dto); }

  @Perm('residences', 'e') @Put('residences/:id')
  updateResidence(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: ResidenceDto) { return this.svc.updateResidence(u, id, dto); }

  @Perm('residences', 'd') @HttpCode(204) @Delete('residences/:id')
  removeResidence(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.removeResidence(u, id); }

  @Perm('residences', 'v') @Get('residences/:id/buildings')
  listBuildings(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.listBuildings(u, id); }

  @Perm('residences', 'e') @Post('buildings')
  createBuilding(@CurrentUser() u: AuthUser, @Body() dto: BuildingDto) { return this.svc.createBuilding(u, dto); }

  @Perm('residences', 'e') @Put('buildings/:id')
  updateBuilding(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: BuildingDto) { return this.svc.updateBuilding(u, id, dto); }

  @Perm('residences', 'e') @HttpCode(204) @Delete('buildings/:id')
  removeBuilding(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.removeBuilding(u, id); }

  // Residents may read their own lots through finance statements only; the units API is staff-only.
  @Perm('units', 'v') @Get('units')
  listUnits(@CurrentUser() u: AuthUser, @Query() q: UnitQuery) { return this.svc.listUnits(u, q); }

  @Perm('units', 'v') @Get('units/:id')
  getUnit(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.getUnit(u, id); }

  @Perm('units', 'c') @Post('units')
  createUnit(@CurrentUser() u: AuthUser, @Body() dto: UnitDto) { return this.svc.createUnit(u, dto); }

  @Perm('units', 'e') @Put('units/:id')
  updateUnit(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: UnitDto) { return this.svc.updateUnit(u, id, dto); }

  @Perm('units', 'd') @HttpCode(204) @Delete('units/:id')
  removeUnit(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.removeUnit(u, id); }

  @Perm('residents', 'v') @Get('residents')
  listResidents(@CurrentUser() u: AuthUser, @Query() q: ResidentQuery) { return this.svc.listResidents(u, q); }

  @Perm('residents', 'c') @Post('residents')
  createResident(@CurrentUser() u: AuthUser, @Body() dto: ResidentDto) { return this.svc.createResident(u, dto); }

  @Perm('residents', 'e') @Patch('residents/:id/end')
  endOccupancy(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: EndOccupancyDto) { return this.svc.endOccupancy(u, id, dto); }
}
