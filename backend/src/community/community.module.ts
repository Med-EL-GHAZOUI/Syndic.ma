import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assembly, Complaint, DocumentFile, Provider, Unit, WorkOrder } from '../entities';
import { AssembliesService } from './assemblies.service';
import { CommunityController } from './community.controller';
import { DocumentsService } from './documents.service';
import { MaintenanceService } from './maintenance.service';
import { StorageService } from './storage.service';
import { VirusScanService } from './virus-scan.service';

@Module({
  imports: [TypeOrmModule.forFeature([WorkOrder, Assembly, DocumentFile, Provider, Complaint, Unit])],
  controllers: [CommunityController],
  providers: [MaintenanceService, AssembliesService, DocumentsService, StorageService, VirusScanService],
})
export class CommunityModule {}
