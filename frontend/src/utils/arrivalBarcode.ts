export type ArrivalBarcode = { barcodeToken: string; issuedAt: string; expiresAt: string; serverNow: string };
export type ArrivalBarcodeState = { value: string; remainingSeconds: number; loading: boolean; error: string };

type Options = {
  fetchBarcode: () => Promise<ArrivalBarcode>;
  onChange: (state: ArrivalBarcodeState) => void;
  now?: () => number;
  wallNow?: () => number;
  schedule?: (callback: () => void, delay: number) => () => void;
};

export class ArrivalBarcodeController {
  private generation = 0;
  private stopped = false;
  private disposed = false;
  private cancelTimer?: () => void;
  private deadline = 0;
  private wallDeadline = 0;
  private lastWallTime = 0;
  private value = "";
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private readonly schedule: NonNullable<Options["schedule"]>;

  constructor(private readonly options: Options) {
    this.now = options.now || (() => performance.now());
    this.wallNow = options.wallNow || (() => Date.now());
    this.schedule = options.schedule || ((callback, delay) => {
      const timer = setTimeout(callback, delay);
      return () => clearTimeout(timer);
    });
  }

  async refresh() {
    if (this.disposed) return;
    this.stopped = false;
    const generation = ++this.generation;
    this.cancelTimer?.();
    this.value = "";
    this.options.onChange({ value: "", remainingSeconds: 0, loading: true, error: "" });
    const started = this.now();
    const wallStarted = this.wallNow();
    try {
      const credential = await this.options.fetchBarcode();
      if (this.stopped || generation !== this.generation) return;
      const issued = Date.parse(credential.issuedAt);
      const expires = Date.parse(credential.expiresAt);
      const server = Date.parse(credential.serverNow);
      const wallReceived = this.wallNow();
      const remaining = expires - server - Math.max(0, this.now() - started, wallReceived - wallStarted);
      if (!/^QB[A-F0-9]{32}$/.test(credential.barcodeToken) || !Number.isFinite(remaining) ||
          expires - issued !== 120000 || server < issued || remaining <= 0 || wallReceived < wallStarted) throw new Error("Barcode expired. Please retry.");
      this.value = credential.barcodeToken;
      this.deadline = this.now() + remaining;
      this.wallDeadline = wallReceived + remaining;
      this.lastWallTime = wallReceived;
      this.tick();
    } catch (error) {
      if (this.stopped || generation !== this.generation) return;
      this.options.onChange({ value: "", remainingSeconds: 0, loading: false,
        error: error instanceof Error ? error.message : "Barcode unavailable. Please retry." });
    }
  }

  private tick() {
    if (this.stopped || this.disposed) return;
    const wallTime = this.wallNow();
    // Wall time catches OS sleep; monotonic time prevents clock changes extending validity.
    const remaining = Math.min(this.deadline - this.now(), this.wallDeadline - wallTime);
    if (remaining <= 0 || wallTime < this.lastWallTime) {
      void this.refresh();
      return;
    }
    this.lastWallTime = wallTime;
    this.options.onChange({ value: this.value, remainingSeconds: Math.ceil(remaining / 1000), loading: false, error: "" });
    this.cancelTimer = this.schedule(() => this.tick(), Math.min(1000, remaining));
  }

  pause() {
    if (this.disposed) return;
    this.stopped = true;
    ++this.generation;
    this.cancelTimer?.();
    this.value = "";
    this.options.onChange({ value: "", remainingSeconds: 0, loading: false, error: "Barcode paused. Reconnect or return to this page to refresh." });
  }

  dispose() {
    this.disposed = true;
    this.stopped = true;
    ++this.generation;
    this.cancelTimer?.();
  }
}
