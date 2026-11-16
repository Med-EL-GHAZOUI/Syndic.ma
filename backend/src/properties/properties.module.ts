import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Building, Charge, Residence, Resident, Unit } from '../entities';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';

@Module({
  imports: [TypeOrmModule.forFeature([Residence, Building, Unit, Resident, Charge])],
  controllers: [PropertiesController],
  providers: [PropertiesService],
})
export class PropertiesModule {}
