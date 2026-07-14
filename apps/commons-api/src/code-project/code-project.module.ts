import { Module } from '@nestjs/common';
import { ComputerModule } from '~/computer';
import { CodeProjectBuilder } from './code-project.builder';
import {
  CodeProjectController,
  PublicCodeProjectController,
} from './code-project.controller';
import { CodeProjectService } from './code-project.service';
import { CodeProjectStorage } from './code-project.storage';
import { CodeProjectVerifier } from './code-project.verifier';

@Module({
  imports: [ComputerModule],
  controllers: [CodeProjectController, PublicCodeProjectController],
  providers: [
    CodeProjectService,
    CodeProjectBuilder,
    CodeProjectStorage,
    CodeProjectVerifier,
  ],
  exports: [CodeProjectService],
})
export class CodeProjectModule {}
