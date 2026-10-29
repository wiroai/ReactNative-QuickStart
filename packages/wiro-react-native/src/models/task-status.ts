export type WiroTaskStatusKind =
  | 'queued'
  | 'accepted'
  | 'preprocessing'
  | 'preprocessed'
  | 'assigned'
  | 'running'
  | 'output'
  | 'outputComplete'
  | 'errorOutput'
  | 'errorOutputComplete'
  | 'processEnded'
  | 'postProcessing'
  | 'completed'
  | 'cancelled'
  | 'streamReady'
  | 'streamEnded'
  | 'unknown';

export class WiroTaskStatus {
  static readonly queued = WiroTaskStatus.known('queued', 'task_queue');
  static readonly accepted = WiroTaskStatus.known('accepted', 'task_accept');
  static readonly preprocessing = WiroTaskStatus.known(
    'preprocessing',
    'task_preprocess_start',
  );
  static readonly preprocessed = WiroTaskStatus.known(
    'preprocessed',
    'task_preprocess_end',
  );
  static readonly assigned = WiroTaskStatus.known('assigned', 'task_assign');
  static readonly running = WiroTaskStatus.known('running', 'task_start');
  static readonly output = WiroTaskStatus.known('output', 'task_output');
  static readonly outputComplete = WiroTaskStatus.known(
    'outputComplete',
    'task_output_full',
  );
  static readonly errorOutput = WiroTaskStatus.known(
    'errorOutput',
    'task_error',
  );
  static readonly errorOutputComplete = WiroTaskStatus.known(
    'errorOutputComplete',
    'task_error_full',
  );
  static readonly processEnded = WiroTaskStatus.known(
    'processEnded',
    'task_end',
  );
  static readonly postProcessing = WiroTaskStatus.known(
    'postProcessing',
    'task_postprocess_start',
  );
  static readonly completed = WiroTaskStatus.known(
    'completed',
    'task_postprocess_end',
  );
  static readonly cancelled = WiroTaskStatus.known('cancelled', 'task_cancel');
  static readonly streamReady = WiroTaskStatus.known(
    'streamReady',
    'task_stream_ready',
  );
  static readonly streamEnded = WiroTaskStatus.known(
    'streamEnded',
    'task_stream_end',
  );

  readonly apiValue: string;
  readonly kind: WiroTaskStatusKind;
  readonly rawValue: string | undefined;

  private constructor(
    kind: WiroTaskStatusKind,
    apiValue: string,
    rawValue?: string,
  ) {
    this.apiValue = apiValue;
    this.kind = kind;
    this.rawValue = rawValue;
    Object.freeze(this);
  }

  get isTerminal(): boolean {
    return this.kind === 'completed' || this.kind === 'cancelled';
  }

  equals(other: unknown): other is WiroTaskStatus {
    return (
      other instanceof WiroTaskStatus &&
      this.kind === other.kind &&
      this.apiValue === other.apiValue
    );
  }

  static unknown(rawValue: string): WiroTaskStatus {
    return new WiroTaskStatus('unknown', rawValue, rawValue);
  }

  static parse(rawValue: string): WiroTaskStatus {
    return KNOWN_STATUSES.get(rawValue) ?? this.unknown(rawValue);
  }

  private static known(
    kind: Exclude<WiroTaskStatusKind, 'unknown'>,
    apiValue: string,
  ): WiroTaskStatus {
    return new WiroTaskStatus(kind, apiValue);
  }
}

const KNOWN_STATUSES = new Map<string, WiroTaskStatus>(
  [
    WiroTaskStatus.queued,
    WiroTaskStatus.accepted,
    WiroTaskStatus.preprocessing,
    WiroTaskStatus.preprocessed,
    WiroTaskStatus.assigned,
    WiroTaskStatus.running,
    WiroTaskStatus.output,
    WiroTaskStatus.outputComplete,
    WiroTaskStatus.errorOutput,
    WiroTaskStatus.errorOutputComplete,
    WiroTaskStatus.processEnded,
    WiroTaskStatus.postProcessing,
    WiroTaskStatus.completed,
    WiroTaskStatus.cancelled,
    WiroTaskStatus.streamReady,
    WiroTaskStatus.streamEnded,
  ].map((status) => [status.apiValue, status]),
);
