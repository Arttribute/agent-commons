import { Injectable } from '@nestjs/common';
import { Observable, Subscription } from 'rxjs';
import { AgentService } from '../agent.service';
import {
  ExternalRuntimeService,
  type RuntimeRunInput,
} from './external-runtime.service';
import { normalizeRuntimeType } from './runtime.types';

@Injectable()
export class RuntimeDispatcherService {
  constructor(
    private readonly native: AgentService,
    private readonly external: ExternalRuntimeService,
  ) {}

  runAgent(props: RuntimeRunInput & Record<string, any>): Observable<any> {
    return new Observable((subscriber) => {
      let delegated: Subscription | undefined;
      let closed = false;
      void this.native
        .getAgent({ agentId: props.agentId })
        .then((agent) => {
          if (closed) return;
          const runtimeType = normalizeRuntimeType(agent.runtimeType);
          const stream =
            runtimeType === 'native'
              ? this.native.runAgent(props as any)
              : this.external.runAgent(props);
          delegated = stream.subscribe({
            next: (event) => subscriber.next(event),
            error: (error) => subscriber.error(error),
            complete: () => subscriber.complete(),
          });
        })
        .catch((error) => subscriber.error(error));
      return () => {
        closed = true;
        delegated?.unsubscribe();
      };
    });
  }
}
