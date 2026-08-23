import { Module } from '@nestjs/common';
import { ComputerModule } from '~/computer';
import { OAuthModule } from '~/oauth/oauth.module';
import { CodeProjectBuilder } from './code-project.builder';
import {
  CodeProjectController,
  PublicCodeProjectController,
  PublicUiPluginHostController,
} from './code-project.controller';
import { CodeProjectService } from './code-project.service';
import { CodeProjectStorage } from './code-project.storage';
import { CodeProjectVerifier } from './code-project.verifier';

@Module({
  imports: [ComputerModule, OAuthModule],
  controllers: [
    CodeProjectController,
    PublicCodeProjectController,
    PublicUiPluginHostController,
  ],
  providers: [
    CodeProjectService,
    CodeProjectBuilder,
    CodeProjectStorage,
    CodeProjectVerifier,
  ],
  exports: [CodeProjectService],
})
export class CodeProjectModule {}
