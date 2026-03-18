import { SetMetadata } from '@nestjs/common';
import { PUBLIC_KEY } from './api-key.guard';

/** Mark a controller or route as exempt from API-key authentication. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
