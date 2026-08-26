import { Global, Module } from '@nestjs/common';
import { ProvenanceController } from './provenance.controller';
import { ProvenanceService } from './provenance.service';

/**
 * Global capability seam. Agent Commons ships the buffered PostgreSQL sink;
 * the ProvenanceKit exporter and on-chain anchor are optional configuration.
 */
@Global()
@Module({
  controllers: [ProvenanceController],
  providers: [ProvenanceService],
  exports: [ProvenanceService],
})
export class ProvenanceModule {}
