declare global {
  namespace App {
    interface Platform {
      env?: {
        DB?: unknown;
      };
    }
  }

  interface Window {
    __DIQ_READY__?: Promise<void>;
    _diqRestoreAuthoringDraft?: () => void;
  }
}

export {};
