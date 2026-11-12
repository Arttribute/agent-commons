import { Module } from '@nestjs/common';
import { ProjectModule } from '~/project/project.module';
import {
  ProjectEventController,
  PublicEventController,
  EventPaymentWebhookController,
} from './event-registration.controller';
import { EventRegistrationService } from './event-registration.service';
import { PaystackService } from './paystack.service';
@Module({
  imports: [ProjectModule],
  controllers: [
    ProjectEventController,
    PublicEventController,
    EventPaymentWebhookController,
  ],
  providers: [EventRegistrationService, PaystackService],
  exports: [EventRegistrationService],
})
export class EventRegistrationModule {}
